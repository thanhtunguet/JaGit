interface Props {
  users: string[];
  selected: string | null;
  onSelect: (username: string) => void;
}

export function UserSelector({ users, selected, onSelect }: Props) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Users</span>
      <div className="flex flex-wrap gap-2">
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
