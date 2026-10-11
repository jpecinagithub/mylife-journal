/**
 * Maps a category icon string (stored in DB) to a lucide-react component.
 * Unknown values fall back to Tag.
 */
import {
  Book, Film, Plane, Music, Camera, Heart, Star, Briefcase, Coffee, Home,
  Car, MapPin, Users, Gift, Dumbbell, Palette, Tag, UtensilsCrossed, Moon,
  Sun, Sparkles, Gamepad2, Baby, GraduationCap, TreePine, Waves, Mountain,
  Church, PawPrint, ShoppingBag, Ticket, type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  book: Book, film: Film, movie: Film, plane: Plane, travel: Plane, trip: Plane,
  music: Music, camera: Camera, photo: Camera, heart: Heart, love: Heart,
  star: Star, briefcase: Briefcase, work: Briefcase, coffee: Coffee, home: Home,
  car: Car, 'map-pin': MapPin, place: MapPin, users: Users, friends: Users,
  family: Users, gift: Gift, dumbbell: Dumbbell, sport: Dumbbell, palette: Palette,
  art: Palette, food: UtensilsCrossed, restaurant: UtensilsCrossed, moon: Moon,
  sun: Sun, sparkles: Sparkles, game: Gamepad2, baby: Baby, study: GraduationCap,
  nature: TreePine, sea: Waves, beach: Waves, mountain: Mountain, church: Church,
  faith: Church, pet: PawPrint, shopping: ShoppingBag, event: Ticket, tag: Tag,
};

export function CategoryIcon({ icon, size = 16, className }: { icon?: string | null; size?: number; className?: string }) {
  const C = (icon && MAP[icon.toLowerCase()]) || Tag;
  return <C size={size} className={className} aria-hidden />;
}
