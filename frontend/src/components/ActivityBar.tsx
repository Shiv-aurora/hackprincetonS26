// ActivityBar: vertical icon strip on the left edge — VITALS and RECORDS switch personas.
import { Stethoscope, Activity, Pill, FlaskConical, HeartPulse, Settings, UserRound } from "lucide-react";
import { useLayoutState } from "../layout/useLayoutState";

// Renders the 48 px activity bar with persona switchers and disabled production icons.
export default function ActivityBar() {
  const { persona, setPersona } = useLayoutState();

  // Nav items: id maps to persona where applicable; others are disabled production features.
  const navItems = [
    {
      id: "RECORDS",
      icon: Stethoscope,
      label: "Reviewer — SAE narrative review",
      personaTarget: "reviewer" as const,
      disabled: false,
    },
    {
      id: "VITALS",
      icon: Activity,
      label: "Analyst — Dataset and dashboard",
      personaTarget: "analyst" as const,
      disabled: false,
    },
    {
      id: "PHARMACY",
      icon: Pill,
      label: "Production feature",
      personaTarget: null,
      disabled: true,
    },
    {
      id: "LABS",
      icon: FlaskConical,
      label: "Production feature",
      personaTarget: null,
      disabled: true,
    },
    {
      id: "CARDIOLOGY",
      icon: HeartPulse,
      label: "Production feature",
      personaTarget: null,
      disabled: true,
    },
  ];

  return (
    <nav
      className="surface-left flex shrink-0 flex-col items-center border-r border-white/[0.05] py-2 z-40"
      style={{ width: 48 }}
    >
      <div className="flex w-full flex-col gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          // Active when this item's personaTarget matches the current persona.
          const isActive = item.personaTarget !== null && persona === item.personaTarget;
          return (
            <button
              key={item.id}
              onClick={item.personaTarget !== null ? () => setPersona(item.personaTarget!) : undefined}
              title={item.label}
              className={`relative flex w-full items-center justify-center py-3 transition-all duration-150 ${
                isActive
                  ? "text-white opacity-100"
                  : item.disabled
                  ? "cursor-default text-[#6b7178] opacity-35"
                  : "text-[#6b7178] opacity-75 hover:opacity-100 hover:text-[#cbd2d8]"
              }`}
              disabled={item.disabled}
              aria-label={item.label}
              aria-pressed={isActive}
            >
              <Icon size={21} strokeWidth={1.5} />
              {isActive && (
                <div className="absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-full bg-[#85c8ff] opacity-80" />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex w-full flex-col items-center gap-2 pb-2">
        <button
          title="User profile"
          className="p-2 text-[#6b7178] opacity-75 transition-opacity hover:opacity-100 hover:text-[#cbd2d8]"
          aria-label="User profile"
        >
          <UserRound size={21} strokeWidth={1.5} />
        </button>
        <button
          title="Settings"
          className="p-2 text-[#6b7178] opacity-75 transition-opacity hover:opacity-100 hover:text-[#cbd2d8]"
          aria-label="Settings"
        >
          <Settings size={21} strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
}
