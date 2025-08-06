// Debug endpoints for memory inspection
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;

/**
 * Sanitize PII from text
 */
function sanitizePII(text) {
    if (!text) return text;
    
    // Redact email addresses
    text = text.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '[EMAIL_REDACTED]');
    
    // Redact phone numbers (US format)
    text = text.replace(/(\+?1?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g, '[PHONE_REDACTED]');
    
    // Redact SSN-like patterns
    text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]');
    
    // Redact credit card-like patterns
    text = text.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CC_REDACTED]');
    
    // Redact API keys and tokens (common patterns)
    text = text.replace(/\b[A-Za-z0-9]{32,}\b/g, '[TOKEN_REDACTED]');
    
    return text;
}

/**
 * Load persona data from file
 */
async function loadPersonaData(personaId, vaultPath) {
    try {
        const personaFile = path.join(vaultPath, `${personaId}.json`);
        const data = await fs.readFile(personaFile, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return null;
    }
}

/**
 * Initialize debug endpoints
 */
function initializeDebugEndpoints(vaultPath) {
    // GET /debug/persona/:id/short-term
    router.get('/debug/persona/:id/short-term', async (req, res) => {
        try {
            const personaId = req.params.id;
            const personaData = await loadPersonaData(personaId, vaultPath);
            
            if (!personaData) {
                return res.status(404).json({ error: 'Persona not found' });
            }
            
            const shortTerm = personaData.shortTermHistory || [];
            
            // Sanitize and format short-term history
            const sanitized = shortTerm.map((msg, idx) => ({
                index: idx,
                role: msg.role,
                content: sanitizePII(msg.content),
                timestamp: msg.timestamp || null
            }));
            
            res.json({
                personaId,
                count: sanitized.length,
                maxCapacity: 20, // Typical short-term capacity
                messages: sanitized
            });
            
        } catch (error) {
            console.error('[Debug] Error fetching short-term:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    
    // GET /debug/persona/:id/mid-term
    router.get('/debug/persona/:id/mid-term', async (req, res) => {
        try {
            const personaId = req.params.id;
            const personaData = await loadPersonaData(personaId, vaultPath);
            
            if (!personaData) {
                return res.status(404).json({ error: 'Persona not found' });
            }
            
            const midTerm = personaData.midTermSlots || [];
            
            // Sanitize and format mid-term slots
            const sanitized = midTerm.map((slot, idx) => ({
                index: idx,
                summary: sanitizePII(slot.summary),
                priority: slot.priority,
                age: slot.ts ? Math.round((Date.now() - slot.ts) / 60000) : null, // Age in minutes
                timestamp: slot.ts,
                hasEmbedding: !!slot.embedding
            }));
            
            // Sort by priority descending
            sanitized.sort((a, b) => b.priority - a.priority);
            
            res.json({
                personaId,
                count: sanitized.length,
                maxCapacity: 20, // Typical mid-term capacity
                slots: sanitized,
                stats: {
                    avgPriority: sanitized.reduce((sum, s) => sum + s.priority, 0) / (sanitized.length || 1),
                    oldestAge: Math.max(...sanitized.map(s => s.age || 0)),
                    newestAge: Math.min(...sanitized.map(s => s.age || 0))
                }
            });
            
        } catch (error) {
            console.error('[Debug] Error fetching mid-term:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    
    // GET /debug/persona/:id/long-term
    router.get('/debug/persona/:id/long-term', async (req, res) => {
        try {
            const personaId = req.params.id;
            const limit = parseInt(req.query.limit) || 50;
            const personaData = await loadPersonaData(personaId, vaultPath);
            
            if (!personaData) {
                return res.status(404).json({ error: 'Persona not found' });
            }
            
            const longTerm = personaData.longTermStore?.items || [];
            
            // Sanitize and format long-term items
            const sanitized = longTerm.slice(0, limit).map((item, idx) => ({
                index: idx,
                id: item.id,
                summary: sanitizePII(item.summary),
                meta: {
                    timestamp: item.meta?.timestamp,
                    date: item.meta?.date,
                    messageCount: item.meta?.messageCount,
                    age: item.meta?.timestamp ? Math.round((Date.now() - item.meta.timestamp) / 86400000) : null // Age in days
                },
                hasEmbedding: !!item.embedding
            }));
            
            res.json({
                personaId,
                count: longTerm.length,
                returned: sanitized.length,
                limit,
                items: sanitized,
                stats: {
                    totalItems: longTerm.length,
                    oldestAge: Math.max(...sanitized.map(s => s.meta.age || 0)),
                    newestAge: Math.min(...sanitized.map(s => s.meta.age || 0))
                }
            });
            
        } catch (error) {
            console.error('[Debug] Error fetching long-term:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    
    // GET /debug/memory/stats - Overall memory statistics
    router.get('/debug/memory/stats', async (req, res) => {
        try {
            const files = await fs.readdir(vaultPath);
            const personaFiles = files.filter(f => f.endsWith('.json'));
            
            const stats = {
                totalPersonas: 0,
                totalShortTermMessages: 0,
                totalMidTermSlots: 0,
                totalLongTermItems: 0,
                personas: []
            };
            
            for (const file of personaFiles) {
                const personaId = file.replace('.json', '');
                const data = await loadPersonaData(personaId, vaultPath);
                
                if (data) {
                    const shortCount = (data.shortTermHistory || []).length;
                    const midCount = (data.midTermSlots || []).length;
                    const longCount = (data.longTermStore?.items || []).length;
                    
                    stats.totalPersonas++;
                    stats.totalShortTermMessages += shortCount;
                    stats.totalMidTermSlots += midCount;
                    stats.totalLongTermItems += longCount;
                    
                    stats.personas.push({
                        id: personaId,
                        name: data.name,
                        shortTerm: shortCount,
                        midTerm: midCount,
                        longTerm: longCount
                    });
                }
            }
            
            res.json(stats);
            
        } catch (error) {
            console.error('[Debug] Error fetching memory stats:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    
    // GET /debug/cache/stats - TTS cache statistics
    router.get('/debug/cache/stats', async (req, res) => {
        try {
            const ttsCache = require('./ttsCache');
            const stats = await ttsCache.getStats();
            res.json(stats);
        } catch (error) {
            console.error('[Debug] Error fetching cache stats:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    
    return router;
}

module.exports = { initializeDebugEndpoints, sanitizePII };
