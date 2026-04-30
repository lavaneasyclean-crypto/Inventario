import {
  Home,
  Package,
  Users,
  Building2,
  ShoppingBasket,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/",          label: "Inicio",         icon: Home },
  { href: "/pedidos",   label: "Pedidos",        icon: Package },
  { href: "/clientes",  label: "Clientes",       icon: Users },
  { href: "/empresas",  label: "Empresas",       icon: Building2 },
  { href: "/catalogo",  label: "Catálogo",       icon: ShoppingBasket },
];
