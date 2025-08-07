# Profile.md Guide - Persona Identity Management

## Overview

Each persona's identity is now defined in a `Profile.md` file located in their persona folder. This markdown file is human-readable and directly editable, making it easy to customize persona behaviors and characteristics.

## File Location

```
C:\Users\jakek\Documents\ai-local-data\Personas\[PersonaName]\Profile.md
```

## Profile Structure

The Profile.md file uses markdown headers to organize different aspects of the persona's identity:

```markdown
# [Persona Name]

## Description
A brief overview of the persona's character and purpose.

## Pronouns
The persona's preferred pronouns (e.g., she/her, he/him, they/them)

## Communication Style
How the persona speaks and interacts - tone, formality, quirks, etc.

## Personality Traits
- Trait 1
- Trait 2
- Trait 3

## Background
The persona's backstory, history, or context.

## Topics of Interest
- Topic 1
- Topic 2
- Topic 3

## Goals
- Goal 1
- Goal 2
- Goal 3

## Knowledge & Expertise
- Area of expertise 1
- Area of expertise 2
- Area of expertise 3
```

## Supported Sections

### Required Sections
- **# [Name]** - The main header with the persona's name

### Optional Sections (all enhance the persona if provided)
- **Description** or **Overview** - Character summary
- **Pronouns** - Preferred pronouns
- **Communication Style** or **Style** - How they communicate
- **Personality Traits** or **Traits** - Character traits (bullet list)
- **Background** or **Backstory** - History and context
- **Topics of Interest** or **Topics** or **Interests** - What they like to discuss (bullet list)
- **Goals** or **Objectives** - What they aim to achieve (bullet list)
- **Knowledge & Expertise** or **Knowledge** or **Expertise** - Areas of expertise (bullet list)

## How It Works

1. **Loading Priority**: When a persona is loaded, the system first checks for `Profile.md`. If found, it uses that for the persona's identity. If not, it falls back to any profile data in `persona.json`.

2. **Direct Editing**: You can edit the `Profile.md` file directly in any text editor. Changes take effect the next time the persona is loaded.

3. **AI Integration**: All profile information is included in the AI's system prompt, influencing how the persona responds.

## Examples

### Chaotic Character (Jinx)
```markdown
# Jinx

## Communication Style
Energetic, playful, and unpredictable. Often uses explosive language, makes jokes, and can switch from friendly to menacing quickly. Speaks with enthusiasm and lots of exclamation marks!

## Personality Traits
- Chaotic and unpredictable
- Creative with destruction
- Playful but dangerous
```

### Professional Assistant (Memo)
```markdown
# Memo

## Communication Style
Clear, organized, and methodical. Uses structured responses with bullet points and categories. Professional but friendly.

## Personality Traits
- Organized and systematic
- Detail-oriented
- Helpful and supportive
```

## Creating a New Persona

1. Create a new folder in the Personas directory
2. Create a `Profile.md` file in that folder
3. Add at least the name header and a description
4. Save the file - the persona is now ready to use

## Tips for Effective Profiles

1. **Be Specific**: The more detailed the profile, the more consistent the persona's behavior
2. **Use Keywords**: Include relevant terms in Knowledge & Expertise for better context
3. **Define Communication Style**: This has the strongest impact on how the persona speaks
4. **Set Clear Goals**: Goals help the persona stay focused and purposeful
5. **Include Background**: Context helps create more believable interactions

## Integration with Memory System

The Profile.md system works seamlessly with the access-based memory system:
- **Topics of Interest** influence what gets higher priority in memory
- **Knowledge & Expertise** areas get special attention in memory categorization
- **Goals** help determine what information is important to remember

## Migrating Existing Personas

If you have existing personas without Profile.md files:
1. The system will automatically generate a Profile.md when you save the persona
2. You can manually create one by copying the template above
3. Any existing profile data in persona.json will be preserved until migrated

## Advanced Features

### Category Assignment for Memory
Memories are automatically categorized based on the profile:
- Personal information → `personal` category (2.0x priority)
- Technical topics from expertise → `technical` category (1.8x priority)
- Project-related from goals → `project` category (1.7x priority)

### Dynamic Profile Updates
While the AI can't modify Profile.md directly during conversation, you can:
1. Edit the file while the app is running
2. The changes apply on the next conversation turn
3. No need to restart the application

## Troubleshooting

- **Changes not appearing**: Make sure you saved the Profile.md file
- **Formatting issues**: Ensure headers use `##` and lists use `-`
- **Special characters**: Use standard markdown escaping for special characters
- **File not found**: Check that the file is named exactly `Profile.md` (case-sensitive on some systems)
