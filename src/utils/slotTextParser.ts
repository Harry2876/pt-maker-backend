

import { ParsedSlot } from '../types/quickSlot';

export interface ParseResult {
    success: boolean;
    slots: ParsedSlot[];
    errors: string[];
    warnings: string[];
}

export class SlotTextParser {
    // Regex patterns for different slot formats
    private static readonly PATTERNS = [
        // "Slot 01  ->  Team Name" or "Slot 1 -> Team Name"
        /^slot\s*(\d{1,2})\s*(?:->|–|—|:)\s*(.+)$/i,
        // "1. Team Name" or "01. Team Name"
        /^(\d{1,2})\.\s*(.+)$/,
        // "Slot 01 - Team Name"
        /^slot\s*(\d{1,2})\s*-\s*(.+)$/i,
    ];

    // Special indicators for empty/reserved slots
    private static readonly EMPTY_INDICATORS = [
        'empty',
        'not to be occupied',
        'reserved',
        'management slot',
        'organizer slot',
        'admin slot',
        'n/a',
        'na',
        '-',
        '--',
        'none'
    ];

    /**
     * Parse slot text into structured slot assignments
     * @param text Raw slot text pasted by user
     * @returns ParseResult with parsed slots and any errors/warnings
     */
    static parse(text: string): ParseResult {
        const slots: ParsedSlot[] = [];
        const errors: string[] = [];
        const warnings: string[] = [];
        const seenSlotNumbers = new Set<number>();

        // Split into lines and process each
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        if (lines.length === 0) {
            errors.push('No valid slot data found in input text');
            return { success: false, slots, errors, warnings };
        }

        lines.forEach((line, lineIndex) => {
            const parsed = this.parseLine(line);

            if (parsed) {
                // Check for duplicate slot numbers
                if (seenSlotNumbers.has(parsed.slotNumber)) {
                    errors.push(`Line ${lineIndex + 1}: Duplicate slot number ${parsed.slotNumber}`);
                    return;
                }

                // Validate slot number range
                if (parsed.slotNumber < 1 || parsed.slotNumber > 25) {
                    errors.push(`Line ${lineIndex + 1}: Slot number ${parsed.slotNumber} is out of range (must be 1-25)`);
                    return;
                }

                // Check if slot is empty/reserved
                if (this.isEmptySlot(parsed.teamName)) {
                    warnings.push(`Slot ${parsed.slotNumber} is marked as empty/reserved and will be skipped`);
                    return; // Don't add empty slots to result
                }

                seenSlotNumbers.add(parsed.slotNumber);
                slots.push(parsed);
            } else {
                warnings.push(`Line ${lineIndex + 1}: Could not parse line: "${line}"`);
            }
        });

        // Sort slots by slot number
        slots.sort((a, b) => a.slotNumber - b.slotNumber);

        return {
            success: errors.length === 0 && slots.length > 0,
            slots,
            errors,
            warnings
        };
    }

    /**
     * Parse a single line of slot text
     * @param line Single line of text
     * @returns ParsedSlot or null if line cannot be parsed
     */
    private static parseLine(line: string): ParsedSlot | null {
        for (const pattern of this.PATTERNS) {
            const match = line.match(pattern);
            if (match) {
                const slotNumber = parseInt(match[1], 10);
                const teamName = match[2].trim();

                if (isNaN(slotNumber) || !teamName) {
                    return null;
                }

                return {
                    slotNumber,
                    teamName: this.cleanTeamName(teamName),
                    rawText: line
                };
            }
        }

        return null;
    }

    /**
     * Check if a team name indicates an empty/reserved slot
     * @param teamName Team name to check
     * @returns True if slot should be considered empty
     */
    private static isEmptySlot(teamName: string): boolean {
        const normalized = teamName.toLowerCase().trim();
        return this.EMPTY_INDICATORS.some(indicator => normalized.includes(indicator));
    }

    /**
     * Clean and normalize team name
     * @param teamName Raw team name
     * @returns Cleaned team name
     */
    private static cleanTeamName(teamName: string): string {
        return teamName
            .replace(/^team\s+/i, '') // Remove "Team " prefix if present
            .trim()
            .replace(/\s+/g, ' '); // Normalize whitespace
    }

    /**
     * Validate parsed slots
     * @param slots Array of parsed slots
     * @returns Validation result with errors
     */
    static validateSlots(slots: ParsedSlot[]): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (slots.length === 0) {
            errors.push('No slots found');
            return { isValid: false, errors };
        }

        if (slots.length > 25) {
            errors.push('Cannot have more than 25 slots');
        }

        // Check for duplicate slot numbers
        const slotNumbers = slots.map(s => s.slotNumber);
        const duplicates = slotNumbers.filter((num, index) => slotNumbers.indexOf(num) !== index);
        if (duplicates.length > 0) {
            errors.push(`Duplicate slot numbers found: ${Array.from(new Set(duplicates)).join(', ')}`);
        }

        // Check for invalid team names
        slots.forEach(slot => {
            if (slot.teamName.length < 2) {
                errors.push(`Slot ${slot.slotNumber}: Team name too short`);
            }
            if (slot.teamName.length > 50) {
                errors.push(`Slot ${slot.slotNumber}: Team name too long (max 50 characters)`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Format slots back into readable text
     * @param slots Array of parsed slots
     * @returns Formatted text representation
     */
    static format(slots: ParsedSlot[]): string {
        return slots
            .sort((a, b) => a.slotNumber - b.slotNumber)
            .map(slot => `Slot ${slot.slotNumber.toString().padStart(2, '0')}  ->  Team ${slot.teamName}`)
            .join('\n');
    }
}