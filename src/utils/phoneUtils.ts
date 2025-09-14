export class PhoneUtils {
    private static readonly DEFAULT_COUNTRY_CODE = '+91';
    
    /**
     * Normalize phone number to international format
     * Handles: +919876543210, 919876543210, 9876543210
     */
    static normalize(phoneNumber: string, defaultCountryCode = this.DEFAULT_COUNTRY_CODE): string {
        if (!phoneNumber) {
            throw new Error('Phone number is required');
        }

        // Remove all non-digits
        let cleaned = phoneNumber.replace(/\D/g, '');
        
        // Handle different formats
        if (cleaned.startsWith('91') && cleaned.length === 12) {
            // 919876543210 -> +919876543210
            return '+' + cleaned;
        }
        
        if (cleaned.length === 10) {
            // 9876543210 -> +919876543210
            return defaultCountryCode + cleaned;
        }
        
        // If already has +, validate and return
        if (phoneNumber.startsWith('+')) {
            if (this.isValid(phoneNumber)) {
                return phoneNumber;
            }
        }
        
        throw new Error('Invalid phone number format. Use +919876543210, 919876543210, or 9876543210');
    }
    
    /**
     * Validate normalized phone number
     */
    static isValid(phoneNumber: string): boolean {
        // International format: +[country code][number]
        return /^\+[1-9]\d{1,14}$/.test(phoneNumber);
    }
    
    /**
     * Format phone number for display
     * +919876543210 -> +91 98765 43210
     */
    static formatForDisplay(phoneNumber: string): string {
        if (!phoneNumber.startsWith('+91')) {
            return phoneNumber;
        }
        
        const number = phoneNumber.substring(3); // Remove +91
        return `+91 ${number.substring(0, 5)} ${number.substring(5)}`;
    }
    
    /**
     * Extract country code from phone number
     */
    static getCountryCode(phoneNumber: string): string {
        if (phoneNumber.startsWith('+91')) return '+91';
        if (phoneNumber.startsWith('+1')) return '+1';
        // Add more country codes as needed
        return '+91'; // Default
    }
}