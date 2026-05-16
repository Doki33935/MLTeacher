import { Router } from 'express';
import pool from '../db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

// Получить список сессий
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM sessions ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка получения сессий' });
  }
});

// Создать новую сессию
router.post('/', async (req, res) => {
  try {
    const title = req.body?.title?.trim() || 'Новый чат';
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO sessions (title) VALUES (?)',
      [title]
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM sessions WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка создания сессии' });
  }
});

// Удалить сессию
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM sessions WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка удаления сессии' });
  }
});

export default router;
