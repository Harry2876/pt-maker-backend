import { r2Service } from '../services/cloudflareR2Service';
import { resolveR2ObjectKey } from './r2UrlUtils';

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

/**
 * Read template capacity from a config JSON in R2.
 * Falls back to grid_columns × grid_rows or cards.length when capacity is absent.
 */
export async function getTemplateCapacity(templateConfigUrl: string): Promise<number> {
    const key = resolveR2ObjectKey(templateConfigUrl);
    if (!key) {
        throw new Error('Invalid template config URL');
    }

    const config = await r2Service.getObjectJson<TemplateConfigJson>(key);

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

    throw new Error('Template config does not define a team capacity');
}
