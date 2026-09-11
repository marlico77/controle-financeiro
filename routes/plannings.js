const express = require('express');
const { query } = require('../database');
const router = express.Router();

// GET all plannings
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT * FROM plannings ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar planejamentos' });
    }
});

// GET a single planning with its activities and menus
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const planningRes = await query('SELECT * FROM plannings WHERE id = $1', [id]);
        if (planningRes.rowCount === 0) return res.status(404).json({ error: 'Planejamento não encontrado' });
        
        const activitiesRes = await query('SELECT * FROM planning_activities WHERE planning_id = $1 ORDER BY date, time', [id]);
        const menusRes = await query('SELECT * FROM planning_menus WHERE planning_id = $1 ORDER BY date', [id]);
        
        res.json({
            ...planningRes.rows[0],
            activities: activitiesRes.rows,
            menus: menusRes.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar planejamento' });
    }
});

// POST a new planning
router.post('/', async (req, res) => {
    try {
        const { name, start_date, end_date } = req.body;
        const result = await query(
            'INSERT INTO plannings (name, start_date, end_date) VALUES ($1, $2, $3) RETURNING *',
            [name, start_date, end_date]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao criar planejamento' });
    }
});

// POST an activity
router.post('/:id/activities', async (req, res) => {
    try {
        const { id } = req.params;
        const { date, time, description, responsible } = req.body;
        const result = await query(
            'INSERT INTO planning_activities (planning_id, date, time, description, responsible) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [id, date, time, description, responsible]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao criar atividade' });
    }
});

// POST a menu
router.post('/:id/menus', async (req, res) => {
    try {
        const { id } = req.params;
        const { date, meal, description } = req.body;
        const result = await query(
            'INSERT INTO planning_menus (planning_id, date, meal, description) VALUES ($1, $2, $3, $4) RETURNING *',
            [id, date, meal, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao criar cardápio' });
    }
});

// DELETE an activity
router.delete('/activities/:activityId', async (req, res) => {
    try {
        const { activityId } = req.params;
        await query('DELETE FROM planning_activities WHERE id = $1', [activityId]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao deletar atividade' });
    }
});

// DELETE a menu
router.delete('/menus/:menuId', async (req, res) => {
    try {
        const { menuId } = req.params;
        await query('DELETE FROM planning_menus WHERE id = $1', [menuId]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao deletar cardápio' });
    }
});


// PUT update a planning
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, start_date, end_date } = req.body;
        const result = await query(
            'UPDATE plannings SET name = $1, start_date = $2, end_date = $3 WHERE id = $4 RETURNING *',
            [name, start_date, end_date, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Planejamento não encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar planejamento' });
    }
});


// PUT update activity
router.put('/activities/:id', async (req, res) => {
    try {
        const { time, description, responsible } = req.body;
        const result = await query(
            'UPDATE planning_activities SET time = $1, description = $2, responsible = $3 WHERE id = $4 RETURNING *',
            [time, description, responsible, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar atividade' });
    }
});

// PUT update menu
router.put('/menus/:id', async (req, res) => {
    try {
        const { meal, description } = req.body;
        const result = await query(
            'UPDATE planning_menus SET meal = $1, description = $2 WHERE id = $3 RETURNING *',
            [meal, description, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar cardápio' });
    }
});

module.exports = router;
