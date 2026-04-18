import { Stethoscope, Activity, HeartPulse, Pill, FlaskConical, Settings, UserRound } from 'lucide-react';

interface ActivityBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function ActivityBar({ activeTab, onTabChange }: ActivityBarProps) {
  const navItems = [
    { id: 'RECORDS', icon: Stethoscope, label: 'Patient Records' },
    { id: 'VITALS', icon: Activity, label: 'Analytics' },
    { id: 'PHARMACY', icon: Pill, label: 'Pharmacy/Medications' },
    { id: 'LABS', icon: FlaskConical, label: 'Laboratory' },
    { id: 'CARDIOLOGY', icon: HeartPulse, label: 'Cardiology' },
  ];

  return (
    <nav className="w-12 bg-surface-container-low flex flex-col items-center py-2 shrink-0 z-40 border-r border-vscode-border">
      <div className="flex flex-col w-full gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              title={item.label}
              className={`flex items-center justify-center w-full py-3 transition-opacity duration-150 relative ${
                isActive 
                  ? 'text-white opacity-100' 
                  : 'text-[#858585] opacity-70 hover:opacity-100'
              }`}
            >
              <Icon size={22} strokeWidth={1.5} />
              {isActive && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white opacity-30" />}
            </button>
          );
        })}
      </div>

      <div className="mt-auto w-full flex flex-col items-center gap-2 pb-2">
        <button className="text-[#858585] opacity-70 hover:opacity-100 transition-opacity p-2">
          <UserRound size={22} strokeWidth={1.5} />
        </button>
        <button className="text-[#858585] opacity-70 hover:opacity-100 transition-opacity p-2">
          <Settings size={22} strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
}
