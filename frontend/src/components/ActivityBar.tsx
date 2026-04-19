import { Stethoscope, Activity, Pill, FlaskConical, HeartPulse, Settings, UserRound } from "lucide-react";

interface ActivityBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function ActivityBar({ activeTab, onTabChange }: ActivityBarProps) {
  const navItems = [
    { id: "RECORDS", icon: Stethoscope, label: "Document — View SAE narrative" },
    { id: "VITALS", icon: Activity, label: "Privacy Stats — Session audit log" },
    { id: "PHARMACY", icon: Pill, label: "Settings — API & model config" },
    { id: "LABS", icon: FlaskConical, label: "Lab Results — Production feature" },
    { id: "CARDIOLOGY", icon: HeartPulse, label: "Cardiology — Production feature" },
  ];

  return (
    <nav className="surface-left flex w-13 shrink-0 flex-col items-center border-r border-white/[0.05] py-2 z-40">
      <div className="flex w-full flex-col gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isProduction = item.id === "LABS" || item.id === "CARDIOLOGY";
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              title={item.label}
              className={`relative flex w-full items-center justify-center py-3 transition-all duration-150 ${
                isActive
                  ? "text-white opacity-100"
                  : isProduction
                  ? "cursor-default text-[#6b7178] opacity-35"
                  : "text-[#6b7178] opacity-75 hover:opacity-100 hover:text-[#cbd2d8]"
              }`}
              disabled={isProduction}
            >
              <Icon size={21} strokeWidth={1.5} />
              {isActive && <div className="absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-full bg-[#85c8ff] opacity-80" />}
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex w-full flex-col items-center gap-2 pb-2">
        <button
          title="User profile"
          className="p-2 text-[#6b7178] opacity-75 transition-opacity hover:opacity-100 hover:text-[#cbd2d8]"
        >
          <UserRound size={21} strokeWidth={1.5} />
        </button>
        <button
          title="Settings"
          onClick={() => onTabChange("PHARMACY")}
          className={`p-2 transition-opacity hover:opacity-100 ${
            activeTab === "PHARMACY" ? "text-white opacity-100" : "text-[#6b7178] opacity-75 hover:text-[#cbd2d8]"
          }`}
        >
          <Settings size={21} strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
}
