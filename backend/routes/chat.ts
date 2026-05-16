import { Router } from 'express';
import pool from '../db';
import { RowDataPacket } from 'mysql2';

const router = Router();

const API_KEY = process.env.AI_API_KEY || 'YOUR_API_KEY';
const API_BASE_URL = process.env.AI_BASE_URL || 'https://gate.trinity.tg/orion/v1';
const AI_MODEL = process.env.AI_MODEL || 'gpt-5.4';

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

    // Формируем входное сообщение для AI (системный промпт + история)
    const inputParts = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...history.map((msg: RowDataPacket) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content as string,
      })),
    ];

    // Собираем input как текст с контекстом
    const inputText = inputParts.map((m) => `[${m.role}]: ${m.content}`).join('\n\n');

    // Retry with exponential backoff on overload
    let aiContent = '';
    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${API_BASE_URL}/responses`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: AI_MODEL,
            input: inputText,
            max_output_tokens: 4096,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          const err: any = new Error(`API returned ${response.status}: ${errBody}`);
          err.status = response.status;
          throw err;
        }

        const data: any = await response.json();
        aiContent = data.output?.[0]?.content?.[0]?.text
          || data.choices?.[0]?.message?.content
          || data.content?.[0]?.text
          || data.output
          || 'Не удалось получить ответ';
        break;
      } catch (err: any) {
        if ((err.status === 502 || err.status === 503 || err.status === 429) && attempt < maxRetries) {
          const delay = 2000 * Math.pow(2, attempt);
          console.log(`API error ${err.status}, retry ${attempt + 1}/${maxRetries} in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        console.error('AI API error:', err.message);
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
