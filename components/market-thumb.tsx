// A Market's picture: its Polymarket image, or a placeholder for its Category so the cards stay even.
// Decorative (alt=""): the Market's name sits right next to it.
import Image from "next/image";

const GLYPHS: Record<string, string> = {
  politics: "P",
  sports: "S",
  crypto: "₿",
  finance: "$",
  tech: "T",
  world: "W",
  culture: "C",
};

export function MarketThumb({
  id,
  image,
  category,
  size = 40,
}: {
  id: string;
  image: string | null;
  category: string;
  size?: number;
}) {
  const box = "shrink-0 overflow-hidden rounded-lg border border-line bg-raised";
  if (image) {
    return (
      <span data-testid={`thumb-${id}`} data-thumb="image" className={box} style={{ width: size, height: size }}>
        <Image src={image} alt="" width={size} height={size} className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span
      data-testid={`thumb-${id}`}
      data-thumb={`placeholder-${category}`}
      aria-hidden
      className={`${box} grid place-items-center bg-accent-soft text-sm font-bold text-accent`}
      style={{ width: size, height: size }}
    >
      {GLYPHS[category] ?? "•"}
    </span>
  );
}
