import { useState } from 'react';

const IMAGES = [
  { id: 'img-1', name: 'Knee (R)', kind: '자기공명영상검사(MRI)', date: '20260320' },
  { id: 'img-2', name: 'Chest', kind: '일반사진(XC)', date: '20260319' },
  { id: 'img-3', name: 'Brain', kind: '컴퓨터단층촬영(CT)', date: '20260317' },
  { id: 'img-4', name: 'Spine', kind: '자기공명영상검사(MRI)', date: '20260311' },
];

const ACTIONS = ['의사공유', '병원전달', 'CD신청', '다운로드', '삭제'];

export function ImagesPage() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fire = (action: string) => {
    setToast(`${action}: ${selected.size === 0 ? '선택된 영상 없음' : `${selected.size}건 처리 (mock)`}`);
    window.setTimeout(() => setToast(null), 1800);
  };

  const filtered = IMAGES.filter(
    (i) => !query || i.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="images">
      <h1 className="images__title">내 영상 목록</h1>

      <div className="images__searchrow">
        <input
          type="text"
          aria-label="병원명 또는 이름 검색"
          placeholder="병원명 또는 이름 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="images__search"
        />
      </div>

      <div className="images__count">{filtered.length}건</div>

      <ul className="images__list">
        {filtered.map((img) => (
          <li key={img.id} className="image-card">
            <label className="image-card__check">
              <input
                type="checkbox"
                aria-label={`${img.name} 선택`}
                checked={selected.has(img.id)}
                onChange={() => toggle(img.id)}
              />
            </label>
            <div className="image-card__thumb" aria-hidden="true">
              🩻
            </div>
            <div className="image-card__meta">
              <div className="image-card__name">{img.name}</div>
              <div className="image-card__kind">{img.kind}</div>
              <div className="image-card__date">{img.date} 촬영</div>
            </div>
            <button type="button" className="image-card__zoom" aria-label={`${img.name} 확대`}>
              확대
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className="images__upload" aria-label="영상 올리기">
        +
      </button>

      <div className="images__actionbar" role="toolbar" aria-label="영상 작업">
        {ACTIONS.map((a) => (
          <button key={a} type="button" className="images__action" onClick={() => fire(a)}>
            {a}
          </button>
        ))}
      </div>

      {toast && <div className="images__toast">{toast}</div>}
    </div>
  );
}
