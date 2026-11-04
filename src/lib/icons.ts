import type { Component } from 'vue'
import {
  Utensils, Coffee, Beer, CupSoda, Croissant, Moon, Pizza, Shirt, Dumbbell, Footprints, Watch, Goal, Trophy, Tag,
  PartyPopper, Wine, Clapperboard, Ticket, Heart, Plane, Gift, Bus, Bed, Laptop, Repeat, HeartPulse, ShoppingBag,
  Music, Gamepad2, Car, House, Fuel, Banknote, CircleHelp,
} from 'lucide-vue-next'

export const ICONS: Record<string, Component> = {
  utensils: Utensils, coffee: Coffee, beer: Beer, 'cup-soda': CupSoda, croissant: Croissant, moon: Moon, pizza: Pizza,
  shirt: Shirt, dumbbell: Dumbbell, footprints: Footprints, watch: Watch, goal: Goal, trophy: Trophy, tag: Tag,
  'party-popper': PartyPopper, wine: Wine, clapperboard: Clapperboard, ticket: Ticket, heart: Heart, plane: Plane,
  gift: Gift, bus: Bus, bed: Bed, laptop: Laptop, repeat: Repeat, 'heart-pulse': HeartPulse, 'shopping-bag': ShoppingBag,
  music: Music, gamepad: Gamepad2, car: Car, house: House, fuel: Fuel, banknote: Banknote,
}
export const iconFor = (key: string): Component => ICONS[key] ?? CircleHelp

export const CATEGORY_COLORS = ['#55D6A0', '#F2C66D', '#FF786B', '#FF8FB1', '#B79CED', '#6C8CF2', '#6CC4F2', '#929DA5']
