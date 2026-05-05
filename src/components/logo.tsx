import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/logo.svg"
      alt="Easy Clean"
      width={size}
      height={size}
      priority
      className={cn("shrink-0", className)}
    />
  );
}
