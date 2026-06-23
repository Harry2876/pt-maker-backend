import { r2Service } from '../services/cloudflareR2Service';
import { signedUrlUtility } from '../services/signedUrlUtility';
import { resolveR2ObjectKey } from './r2UrlUtils';
import { ServiceError } from './serviceError';

interface TemplateConfigJson {
    template_info?: {
        capacity?: number;
        grid_columns?: number;
        grid_rows?: number;
    };
    team_grid?: {
        cards?: unknown[];
        columns?: number;
        rows?: number;
    };
}

/** Extract R2 object key from any template URL the client or templateService may provide. */
export function resolveTemplateR2Key(url: string): string {
    const key = resolveR2ObjectKey(url);
    if (!key) {
        throw new ServiceError('Invalid template URL — could not resolve R2 object key', 400, 'INVALID_TEMPLATE_URL');
    }
    return key;
}

/**
 * Re-sign template image + config URLs before sending to Python.
 * Python fetches these over HTTP; raw R2 URLs are private and expire without auth.
 */
export async function resolveSignedTemplateUrlsForPython(
    templateUrl: string,
    templateConfigUrl: string,
    expiryMinutes = 60
): Promise<{ templateUrl: string; templateConfigUrl: string }> {
    const templateKey = resolveTemplateR2Key(templateUrl);
    const configKey = resolveTemplateR2Key(templateConfigUrl);

    const [templateSigned, configSigned] = await Promise.all([
        signedUrlUtility.generateSignedUrl(templateKey, { expiryMinutes }),
        signedUrlUtility.generateSignedUrl(configKey, { expiryMinutes }),
    ]);

    return {
        templateUrl: templateSigned.signedUrl,
        templateConfigUrl: configSigned.signedUrl,
    };
}

/**
 * Read template capacity from a config JSON in R2.
 * Falls back to grid_columns × grid_rows or cards.length when capacity is absent.
 */
export async function getTemplateCapacity(templateConfigUrl: string): Promise<number> {
    const key = resolveTemplateR2Key(templateConfigUrl);
    return getTemplateCapacityByKey(key);
}

/** Read template capacity directly from an R2 config object key. */
export async function getTemplateCapacityByKey(configKey: string): Promise<number> {
    const config = await r2Service.getObjectJson<TemplateConfigJson>(configKey);

    if (typeof config.template_info?.capacity === 'number' && config.template_info.capacity > 0) {
        return config.template_info.capacity;
    }

    const cols = config.template_info?.grid_columns ?? config.team_grid?.columns;
    const rows = config.template_info?.grid_rows ?? config.team_grid?.rows;
    if (typeof cols === 'number' && typeof rows === 'number' && cols > 0 && rows > 0) {
        return cols * rows;
    }

    const cardCount = config.team_grid?.cards?.length;
    if (typeof cardCount === 'number' && cardCount > 0) {
        return cardCount;
    }

    throw new ServiceError('Template config does not define a team capacity', 400, 'INVALID_TEMPLATE_CONFIG');
}
