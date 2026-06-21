interface Props {
  users: string[];
  selected: string | null;
  onSelect: (username: string) => void;
}

export function UserSelector({ users, selected, onSelect }: Props) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onSelect("")}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
            !selected
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Overview
        </button>
        {users.map((u) => (
          <button
            key={u}
            onClick={() => onSelect(u)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              selected === u
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  );
}
