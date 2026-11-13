import { Plane, ShieldCheck, Trash2, WifiOff } from "lucide-react";
import { Workspace } from "@/components/stage/workspace";
import { KineticTitle } from "@/components/ui/kinetic-title";
import { ToolBrowser } from "@/components/ui/tool-browser";

const privacyPoints = [
  {
    icon: ShieldCheck,
    title: "Walang upload",
    body: "Files are opened and processed inside this browser tab. Krea has no server to send them to, no accounts and no database.",
  },
  {
    icon: WifiOff,
    title: "Works offline",
    body: "After the first visit the whole app is saved on your device. Open it with no signal and the tools still run.",
  },
  {
    icon: Plane,
    title: "Subukan mo",
    body: "Switch on airplane mode, then drop a file. If a tool needed the internet, it would fail. It does not.",
  },
  {
    icon: Trash2,
    title: "Nothing is kept",
    body: "Files live in memory only. Wipe session clears them at once, and closing the tab does the same.",
  },
];

/** Home: hero and the Stage on top, the tool cards below. */
export default function HomePage() {
  return (
    <>
      <section className="px-4 pb-6 pt-8 text-center lg:px-8 lg:pb-8 lg:pt-12">
        <KineticTitle
          text="Drop a file. Make your move."
          className="mx-auto max-w-4xl text-[2.6rem] font-semibold leading-[1.02] tracking-tight text-fg sm:text-6xl lg:text-7xl"
        />
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">Your files never leave your device.</p>
      </section>

      <Workspace />

      <section id="tools" aria-labelledby="browse-heading" className="mx-auto max-w-7xl px-4 py-12 lg:px-8 lg:py-16">
        <h2 id="browse-heading" className="mb-6 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          Browse tools
        </h2>
        <ToolBrowser />
      </section>

      <section id="privacy" aria-labelledby="privacy-heading" className="border-t border-line">
        <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8 lg:py-16">
          <h2 id="privacy-heading" className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            Private by design
          </h2>
          <ul className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {privacyPoints.map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <Icon aria-hidden className="size-6 text-accent" strokeWidth={1.75} />
                <h3 className="mt-3 text-lg font-semibold text-fg">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-10 max-w-3xl text-sm leading-relaxed text-muted">
            One honest note: Background Remover and ID Photo Maker download their AI model once from a public CDN the
            first time you use them. That is a download of the model only. Your photo is still processed on your device.
          </p>
        </div>
      </section>
    </>
  );
}
