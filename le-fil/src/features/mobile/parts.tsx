import { useState, type CSSProperties } from 'react';

/** Case « terminer » de 46 px (fil, projet ouvert). */
export function DoneBox({ done, late, onToggle }: { done: boolean; late: boolean; onToggle: () => void }) {
  return (
    <button className="m__doneBtn" title="terminer" onClick={onToggle}>
      <span className={`m__box ${done ? 'm__box--done' : ''} ${late ? 'm__box--late' : ''}`}>{done ? '✓' : ''}</span>
    </button>
  );
}

/** Champ de saisie en bas d'écran avec bouton « + » (nouveau lot / nouveau projet). Entrée = créer. */
export function DraftBar({
  placeholder,
  onCommit,
  buttonStyle,
  autoFocus = false,
}: {
  placeholder: string;
  onCommit: (value: string) => void;
  buttonStyle?: CSSProperties;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState('');
  const commit = () => {
    if (!value.trim()) return;
    onCommit(value);
    setValue('');
  };
  return (
    <div className="m__draft">
      <input
        className="m__draftInput"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        enterKeyHint="done"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      <button className="m__draftBtn" style={buttonStyle} onClick={commit} aria-label="ajouter">
        +
      </button>
    </div>
  );
}
