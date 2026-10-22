export type MenuItem = string | '-' | SubMenu | ParamItem;
export interface SubMenu { label: string; items: MenuItem[] }
export interface ParamItem { cmd: string; label: string; params: Record<string, unknown> }

export interface Item { k: 'cmd' | 'act' | 'menu' | 'slot' | 'pop' | 'split' | 'sep'; id: string; label?: string; icon?: string; text?: boolean; swatch?: boolean; items?: MenuItem[]; title?: string; keep?: boolean; params?: Record<string, unknown>; pop?: string; swatchValue?: string }
export interface Rows { rows: Item[][] }
export type Unit = Item | Rows;
export interface GroupDef { id: string; label: string; units: Unit[]; icon?: string; rank?: number; launcher?: string }
export interface TabDef { id: string; label: string; groups: GroupDef[]; ctx?: string; custom?: boolean }

export interface MenuDef { label: string; items: MenuItem[] | (() => MenuItem[]) }
