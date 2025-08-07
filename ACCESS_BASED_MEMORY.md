# Access-Based Memory System

## Overview

The memory system has been refactored from a time-based decay model to an **access-based priority system** that better mimics human memory patterns and maintains relevance based on actual usage rather than age.

## Key Changes

### 1. Priority Calculation (`calculateMemoryPriority`)

Instead of exponential decay over time, priority is now calculated based on:

- **Access Frequency**: How often a memory is accessed relative to its age
- **Category Importance**: Different weights for personal, technical, project, casual, and general memories
- **User Marking**: 2x multiplier for memories marked as important by the user
- **Recency Boost**: Gentle boost for recently accessed memories (not creation time)
- **Semantic Clustering**: Bonus for memories that are part of related topic clusters
- **Base Relevance**: Increases when memories are actually retrieved and used

### 2. Promotion Rules

Memories are promoted from mid-term to long-term based on:

- **Access count ≥ 5**: Frequently accessed memories are promoted
- **User marked important**: Explicitly important memories are promoted
- **Semantic cluster size ≥ 3**: Memories part of topic clusters are promoted

### 3. Capacity-Based Pruning

- Only removes memories when approaching capacity limits (15+ slots)
- Never removes user-marked important memories
- Prioritizes keeping high-priority and recently accessed memories

### 4. Access Tracking During Retrieval

When memories are retrieved for context:
- Access count is incremented
- Last accessed timestamp is updated
- Base relevance is increased (up to 2.0x)

## Benefits Over Time-Based Decay

1. **Preserves Relevance**: Important topics remain accessible regardless of when they were discussed
2. **Handles Irregular Usage**: Works well even if users don't interact daily
3. **User Control**: Ability to mark memories as important
4. **Adaptive Learning**: System learns what's important based on actual usage
5. **Efficient Resource Use**: Only processes memories when needed, not on a constant timer

## Configuration

### Memory Importance Weights
```javascript
{
    personal: 2.0,    // Personal information gets highest priority
    technical: 1.8,   // Technical knowledge is important
    project: 1.7,     // Project-related memories
    casual: 1.0,      // Casual conversation
    general: 1.0      // General topics
}
```

### Promotion Thresholds
- `MIN_ACCESS_COUNT_FOR_PROMOTION`: 5 accesses
- `SEMANTIC_CLUSTER_THRESHOLD`: 3 related memories
- `PROMOTION_THRESHOLD`: 0.2 minimum priority to keep

### Capacity Limits
- Short-term: 10 messages (FIFO queue)
- Mid-term: 20 slots (priority-based)
- Long-term: 100 items (access-based)

## Memory Evaluation Service

The `memoryDecayService` has been renamed conceptually to a memory evaluation service:
- Runs every 10 minutes (instead of 2 minutes)
- Evaluates memories based on access patterns
- Promotes frequently used memories
- Only prunes when near capacity

## Usage Examples

### Marking a Memory as Important
```javascript
addOrUpdateMidTermSlot(persona, {
    summary: "User's birthday is March 15th",
    embedding: embedVector,
    category: 'personal',
    userMarkedImportant: true  // This memory won't decay
});
```

### Category Assignment
```javascript
// Automatically assign categories based on content
const category = detectCategory(summary);
// 'personal' for user info, relationships
// 'technical' for code, programming topics
// 'project' for work-related discussions
// 'casual' for general chat
```

## Testing

Run the comprehensive test suite:
```bash
node test-access-based-memory.js
```

This validates:
- Priority calculation based on access patterns
- Promotion rules for all three criteria
- Access tracking during retrieval
- Category-based weighting
- Capacity-based pruning with important memory preservation

## Migration Note

Existing personas will seamlessly migrate to the new system:
- Old memories without access counts start at 0
- Categories default to 'general' if not specified
- Base relevance defaults to 1.0
- No data loss during transition
