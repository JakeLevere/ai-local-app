// TTS Cache Service - In-memory and disk caching for TTS responses
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class TTSCacheService {
    constructor() {
        this.memoryCache = new Map();
        this.cacheDir = null;
        this.maxMemoryCacheSize = 50; // Max items in memory
        this.maxDiskCacheSize = 500; // Max items on disk
        this.initialized = false;
    }

    /**
     * Initialize the cache with a directory path
     */
    async initialize(basePath) {
        if (!basePath) {
            const documentsPath = require('electron').app.getPath('documents');
            basePath = path.join(documentsPath, 'ai-local-data');
        }
        
        this.cacheDir = path.join(basePath, 'tts-cache');
        
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            this.initialized = true;
            console.log('[TTSCache] Initialized at:', this.cacheDir);
            
            // Load cache index
            await this.loadCacheIndex();
        } catch (error) {
            console.error('[TTSCache] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Generate cache key from text and voice ID
     */
    generateCacheKey(text, voiceId) {
        const normalized = text.toLowerCase().trim();
        const combined = `${normalized}:${voiceId || 'default'}`;
        return crypto.createHash('sha256').update(combined).digest('hex');
    }

    /**
     * Get cached audio if available
     */
    async get(text, voiceId) {
        if (!this.initialized) {
            console.warn('[TTSCache] Cache not initialized');
            return null;
        }

        const key = this.generateCacheKey(text, voiceId);
        
        // Check memory cache first
        if (this.memoryCache.has(key)) {
            const entry = this.memoryCache.get(key);
            entry.lastAccessed = Date.now();
            entry.accessCount++;
            console.log(`[TTSCache] Memory cache HIT for: "${text.substring(0, 30)}..."`);
            return entry.data;
        }

        // Check disk cache
        try {
            const filePath = path.join(this.cacheDir, `${key}.mp3`);
            const metaPath = path.join(this.cacheDir, `${key}.json`);
            
            // Check if file exists
            await fs.access(filePath);
            
            // Read audio data
            const audioData = await fs.readFile(filePath);
            
            // Update metadata
            const meta = await this.readMetadata(metaPath);
            meta.lastAccessed = Date.now();
            meta.accessCount++;
            await this.writeMetadata(metaPath, meta);
            
            // Add to memory cache (LRU)
            this.addToMemoryCache(key, audioData, meta);
            
            console.log(`[TTSCache] Disk cache HIT for: "${text.substring(0, 30)}..."`);
            return audioData;
            
        } catch (error) {
            // Cache miss
            console.log(`[TTSCache] Cache MISS for: "${text.substring(0, 30)}..."`);
            return null;
        }
    }

    /**
     * Store audio in cache
     */
    async set(text, voiceId, audioData) {
        if (!this.initialized) {
            console.warn('[TTSCache] Cache not initialized');
            return;
        }

        const key = this.generateCacheKey(text, voiceId);
        
        // Create metadata
        const meta = {
            text: text.substring(0, 200), // Store truncated text for reference
            voiceId,
            size: audioData.length,
            created: Date.now(),
            lastAccessed: Date.now(),
            accessCount: 1
        };

        // Add to memory cache
        this.addToMemoryCache(key, audioData, meta);

        // Save to disk
        try {
            const filePath = path.join(this.cacheDir, `${key}.mp3`);
            const metaPath = path.join(this.cacheDir, `${key}.json`);
            
            await fs.writeFile(filePath, audioData);
            await this.writeMetadata(metaPath, meta);
            
            console.log(`[TTSCache] Cached: "${text.substring(0, 30)}..." (${audioData.length} bytes)`);
            
            // Check if we need to prune old entries
            await this.pruneIfNeeded();
            
        } catch (error) {
            console.error('[TTSCache] Failed to save to disk:', error);
        }
    }

    /**
     * Add item to memory cache with LRU eviction
     */
    addToMemoryCache(key, data, meta) {
        // Remove oldest if at capacity
        if (this.memoryCache.size >= this.maxMemoryCacheSize) {
            const oldestKey = this.findOldestMemoryCacheKey();
            if (oldestKey) {
                this.memoryCache.delete(oldestKey);
                console.log('[TTSCache] Evicted from memory cache');
            }
        }

        this.memoryCache.set(key, {
            data,
            meta,
            lastAccessed: Date.now(),
            accessCount: meta.accessCount || 1
        });
    }

    /**
     * Find oldest entry in memory cache
     */
    findOldestMemoryCacheKey() {
        let oldestKey = null;
        let oldestTime = Infinity;
        
        for (const [key, entry] of this.memoryCache.entries()) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
            }
        }
        
        return oldestKey;
    }

    /**
     * Read metadata file
     */
    async readMetadata(metaPath) {
        try {
            const content = await fs.readFile(metaPath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            return {
                created: Date.now(),
                lastAccessed: Date.now(),
                accessCount: 0
            };
        }
    }

    /**
     * Write metadata file
     */
    async writeMetadata(metaPath, meta) {
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    }

    /**
     * Load cache index on startup
     */
    async loadCacheIndex() {
        try {
            const files = await fs.readdir(this.cacheDir);
            const mp3Files = files.filter(f => f.endsWith('.mp3'));
            console.log(`[TTSCache] Found ${mp3Files.length} cached audio files`);
            
            // Optionally preload frequently used items into memory
            // This is left as a future optimization
            
        } catch (error) {
            console.error('[TTSCache] Failed to load cache index:', error);
        }
    }

    /**
     * Prune old cache entries if needed
     */
    async pruneIfNeeded() {
        try {
            const files = await fs.readdir(this.cacheDir);
            const mp3Files = files.filter(f => f.endsWith('.mp3'));
            
            if (mp3Files.length <= this.maxDiskCacheSize) {
                return; // No pruning needed
            }
            
            // Get all entries with metadata
            const entries = [];
            for (const file of mp3Files) {
                const key = file.replace('.mp3', '');
                const metaPath = path.join(this.cacheDir, `${key}.json`);
                
                try {
                    const meta = await this.readMetadata(metaPath);
                    entries.push({
                        key,
                        lastAccessed: meta.lastAccessed || 0,
                        accessCount: meta.accessCount || 0
                    });
                } catch (error) {
                    // If metadata is missing, mark for deletion
                    entries.push({
                        key,
                        lastAccessed: 0,
                        accessCount: 0
                    });
                }
            }
            
            // Sort by access time (oldest first) and access count
            entries.sort((a, b) => {
                // Prioritize frequently accessed items
                if (a.accessCount > 10 && b.accessCount <= 10) return 1;
                if (b.accessCount > 10 && a.accessCount <= 10) return -1;
                return a.lastAccessed - b.lastAccessed;
            });
            
            // Remove oldest entries
            const toRemove = entries.slice(0, entries.length - this.maxDiskCacheSize + 10);
            
            for (const entry of toRemove) {
                const filePath = path.join(this.cacheDir, `${entry.key}.mp3`);
                const metaPath = path.join(this.cacheDir, `${entry.key}.json`);
                
                try {
                    await fs.unlink(filePath);
                    await fs.unlink(metaPath);
                    
                    // Also remove from memory cache if present
                    this.memoryCache.delete(entry.key);
                    
                } catch (error) {
                    console.error('[TTSCache] Failed to remove cache entry:', error);
                }
            }
            
            if (toRemove.length > 0) {
                console.log(`[TTSCache] Pruned ${toRemove.length} old cache entries`);
            }
            
        } catch (error) {
            console.error('[TTSCache] Failed to prune cache:', error);
        }
    }

    /**
     * Clear entire cache
     */
    async clear() {
        // Clear memory cache
        this.memoryCache.clear();
        
        // Clear disk cache
        if (this.initialized && this.cacheDir) {
            try {
                const files = await fs.readdir(this.cacheDir);
                
                for (const file of files) {
                    const filePath = path.join(this.cacheDir, file);
                    await fs.unlink(filePath);
                }
                
                console.log('[TTSCache] Cache cleared');
            } catch (error) {
                console.error('[TTSCache] Failed to clear cache:', error);
            }
        }
    }

    /**
     * Get cache statistics
     */
    async getStats() {
        const stats = {
            memoryCacheSize: this.memoryCache.size,
            diskCacheSize: 0,
            totalSize: 0
        };

        if (this.initialized && this.cacheDir) {
            try {
                const files = await fs.readdir(this.cacheDir);
                const mp3Files = files.filter(f => f.endsWith('.mp3'));
                stats.diskCacheSize = mp3Files.length;
                
                // Calculate total size
                for (const file of mp3Files) {
                    const filePath = path.join(this.cacheDir, file);
                    const fileStat = await fs.stat(filePath);
                    stats.totalSize += fileStat.size;
                }
            } catch (error) {
                console.error('[TTSCache] Failed to get stats:', error);
            }
        }

        return stats;
    }
}

module.exports = new TTSCacheService();
