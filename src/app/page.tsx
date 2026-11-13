import { KineticTitle } from "@/components/ui/kinetic-title";
import { Workspace } from "@/components/stage/workspace";

/** Home: The Stage. Drop a file first; Krea offers the Moves that fit it. */
export default function StagePage() {
  return (
    <Workspace
      title={
        <KineticTitle
          text="Drop a file. Make your move."
          className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight text-fg sm:text-7xl"
        />
      }
    />
  );
}
