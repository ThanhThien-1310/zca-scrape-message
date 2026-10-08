import { config } from "../../config.js";

/** Nhóm được gom và đọc ảnh: hợp của nhóm đọc ảnh nghỉ phép (`vision.leave.groups`) và nhóm đọc ảnh đo tốc độ mạng (`vision.speed.groups`). Mỗi ảnh trong các nhóm này được agent phân loại (nghỉ phép, đo tốc độ, hoặc khác). */
export function visionGroups(): string[] {
    return [...new Set([...config.vision.leave.groups, ...config.vision.speed.groups])];
}
