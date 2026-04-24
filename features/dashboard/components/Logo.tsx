import { cn } from "@/lib/utils";
import { Space_Grotesk } from "next/font/google";
import { LogoIcon } from "./LogoIcon";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
});

interface LogoProps {
  className?: string;
  textClassName?: string;
  iconClassName?: string;
}

export const Logo = ({
  className,
  textClassName,
  iconClassName,
}: LogoProps) => {
  return (
    <div className={cn(spaceGrotesk.className, className)}>
      <div className="flex items-center gap-2 text-zinc-700 dark:text-white">
        <LogoIcon className={cn("size-5 text-pink-500", iconClassName)} suffix="-full" />
        <div className="flex flex-col">
          <h1
            className={cn(
              textClassName,
              "text-xl font-semibold tracking-tight"
            )}
          >
            open<span className="font-normal">front</span>
          </h1>
          <span className="-mt-1 text-[9px] font-bold text-pink-500/70 uppercase tracking-wider">
            HOTEL
          </span>
        </div>
      </div>
    </div>
  );
};

export { LogoIcon };
