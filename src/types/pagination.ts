export interface PaginationParams {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}

export interface PaginatedResponse<T> {
    data: T[];
    meta: PaginationMeta;
}

export class PaginationHelper {
    static readonly DEFAULT_PAGE = 1;
    static readonly DEFAULT_LIMIT = 50;
    static readonly MAX_LIMIT = 1000;

    static validateParams(params: PaginationParams) {
        const page = Math.max(1, params.page || this.DEFAULT_PAGE);
        const limit = Math.min(
            Math.max(1, params.limit || this.DEFAULT_LIMIT),
            this.MAX_LIMIT
        );

        return {
            page,
            limit,
            skip: (page - 1) * limit,
            sortBy: params.sortBy || 'createdAt',
            sortOrder: params.sortOrder || 'desc'
        };
    }

    static createMeta(
        page: number,
        limit: number,
        total: number
    ): PaginationMeta {
        const totalPages = Math.ceil(total / limit);
        return {
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        };
    }
}
