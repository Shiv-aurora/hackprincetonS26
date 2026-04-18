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
    <nav className="w-12 bg-surface-container-low flex flex-col items-center py-2 shrink-0 z-40 border-r border-vscode-border">
      <div className="flex flex-col w-full gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isProduction = item.id === "LABS" || item.id === "CARDIOLOGY";
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              title={item.label}
              className={`flex items-center justify-center w-full py-3 transition-opacity duration-150 relative ${
                isActive
                  ? "text-white opacity-100"
                  : isProduction
                  ? "text-[#858585] opacity-40 cursor-default"
                  : "text-[#858585] opacity-70 hover:opacity-100"
              }`}
              disabled={isProduction}
            >
              <Icon size={22} strokeWidth={1.5} />
              {isActive && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white opacity-30" />}
            </button>
          );
        })}
      </div>

      <div className="mt-auto w-full flex flex-col items-center gap-2 pb-2">
        <button
          title="User profile"
          className="text-[#858585] opacity-70 hover:opacity-100 transition-opacity p-2"
        >
          <UserRound size={22} strokeWidth={1.5} />
        </button>
        <button
          title="Settings"
          onClick={() => onTabChange("PHARMACY")}
          className={`opacity-70 hover:opacity-100 transition-opacity p-2 ${
            activeTab === "PHARMACY" ? "text-white opacity-100" : "text-[#858585]"
          }`}
        >
          <Settings size={22} strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
}
