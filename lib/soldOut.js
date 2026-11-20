export const mauritiusToday = (now = Date.now()) => new Date(now + 4 * 3600 * 1000).toISOString().slice(0, 10);

export const isSoldOut = (item, today = mauritiusToday()) => Boolean(item?.sold_out_on) && item.sold_out_on === today;
