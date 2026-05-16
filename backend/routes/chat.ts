import { Router } from 'express';
import pool from '../db';
import { RowDataPacket } from 'mysql2';
import OpenAI from 'openai';

const router = Router();

const client = new OpenAI({
  apiKey: process.env.AI_API_KEY || 'YOUR_API_KEY',
  baseURL: process.env.AI_BASE_URL || 'https://gate.trinity.tg/orion/v1',
});

const SYSTEM_PROMPT = `Ты — AI-репетитор для подготовки к ОГЭ и ЕГЭ. Твоя задача:
1. Помогать ученику разбирать задания из экзаменов
2. Объяснять ошибки пошагово и понятным языком
3. Находить пробелы в знаниях и предлагать темы для повторения
4. Давать подсказки, а не готовые ответы — учить мыслить
5. Поддерживать мотивацию ученика

Отвечай на русском языке. Будь дружелюбным, но точным. Если ученик ошибается — объясни почему, покажи правильный ход рассуждений.`;

// Получить историю сообщений сессии
router.get('/:id/messages', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка получения сообщений' });
  }
});

// Отправить сообщение и получить ответ AI
router.post('/:id/messages', async (req, res) => {
  const { content } = req.body;
  const sessionId = req.params.id;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  }

  try {
    // Сохраняем сообщение пользователя
    await pool.query(
      'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)',
      [sessionId, 'user', content]
    );

    // Получаем историю для контекста
    const [history] = await pool.query<RowDataPacket[]>(
      'SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId]
    );

    // Формируем запрос к AI
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...history.map((msg: RowDataPacket) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content as string,
      })),
    ];

    // Retry with exponential backoff on overload
    let aiContent = '';
    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await client.chat.completions.create({
          model: process.env.AI_MODEL || 'gpt-5-mini',
          messages,
        });
        aiContent = response.choices[0]?.message?.content || 'Не удалось получить ответ';
        break;
      } catch (err: any) {
        if (err.status === 502 && attempt < maxRetries) {
          const delay = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
          console.log(`API overloaded, retry ${attempt + 1}/${maxRetries} in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }

    // Сохраняем ответ AI
    await pool.query(
      'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)',
      [sessionId, 'assistant', aiContent]
    );

    // Обновляем заголовок сессии по первому сообщению (только если название дефолтное)
    const [sessionMessages] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM messages WHERE session_id = ?',
      [sessionId]
    );
    if (sessionMessages[0].count <= 2) {
      const [sessionRows] = await pool.query<RowDataPacket[]>(
        'SELECT title FROM sessions WHERE id = ?',
        [sessionId]
      );
      if (sessionRows[0]?.title === 'Новый чат') {
        const title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
        await pool.query('UPDATE sessions SET title = ? WHERE id = ?', [title, sessionId]);
      }
    }

    res.json({
      userMessage: { role: 'user', content },
      aiMessage: { role: 'assistant', content: aiContent },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка обработки сообщения' });
  }
});

export default router;
