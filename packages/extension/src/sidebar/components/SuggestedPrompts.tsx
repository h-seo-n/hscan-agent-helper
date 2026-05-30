interface Props {
  examples: string[];
  onSelect: (text: string) => void;
}

export function SuggestedPrompts({ examples, onSelect }: Props) {
  if (examples.length === 0) return null;

  return (
    <div className="suggested-prompts" aria-label="추천 질문">
      <p className="suggested-prompts__title">무엇이든 물어보세요.</p>
      <div className="suggested-prompts__list">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            className="suggested-prompts__item"
            onClick={() => onSelect(example)}
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
