import epicCharacters from "./EpicCharacters[1].json" with { type: "json" };
import mythicCharacters from "./MiticCharacters[1].json" with { type: "json" };
import specialCharacters from "./SpecialCharaters[1].json" with { type: "json" };
import legendaryCharacters from "./LegendaryCharacters[1].json" with { type: "json" };
import superSpecialCharacters from "./SuperSpecialCharacters[1].json" with { type: "json" };

interface GachaCharacter {
  name: string;
  rarity: string;
  type: string;
  source?: string;
  value: number;
  img: Array<{ id: number; url: string }>;
}
export const GachaCharacters: Record<string, GachaCharacter> = {
  ...epicCharacters,
  ...mythicCharacters,
  ...specialCharacters,
  ...legendaryCharacters,
  ...superSpecialCharacters,
};