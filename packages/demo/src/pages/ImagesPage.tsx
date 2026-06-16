import { useState } from 'react';

const IMAGES = [
  { id: 'img-1', hospital: '서울병원', name: 'Knee (R)', kind: '자기공명영상검사(MRI)', date: '20260320' },
  { id: 'img-2', hospital: '서울병원', name: 'Chest', kind: '일반사진(XC)', date: '20260319' },
  { id: 'img-3', hospital: '컴퓨터의원', name: 'Brain', kind: '컴퓨터단층촬영(CT)', date: '20260317' },
  { id: 'img-4', hospital: '컴퓨터의원', name: 'Spine', kind: '자기공명영상검사(MRI)', date: '20260311' },
];

const ACTIONS = [
  { id: 'share', label: '의사공유' },
  { id: 'send', label: '병원전달' },
  { id: 'cd-request', label: 'CD신청' },
  { id: 'download', label: '다운로드' },
  { id: 'delete', label: '삭제' },
];

interface ActionStatus {
  actionId: string;
  status: string;
  message: string;
}

export function ImagesPage() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionStatus, setActionStatus] = useState<ActionStatus | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fire = (action: (typeof ACTIONS)[number]) => {
    const hasSelection = selected.size > 0;
    const status = hasSelection ? `${action.id}-complete` : `${action.id}-empty`;
    setActionStatus({
      actionId: action.id,
      status,
      message: `${action.label}: ${hasSelection ? `${selected.size}건 처리 완료 (mock)` : '선택된 영상 없음'}`,
    });
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = IMAGES.filter(
    (i) =>
      !normalizedQuery ||
      i.name.toLowerCase().includes(normalizedQuery) ||
      i.hospital.toLowerCase().includes(normalizedQuery),
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
              <div className="image-card__hospital">{img.hospital}</div>
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
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            data-aiwa-id={`btn-${action.id}`}
            className="images__action"
            onClick={() => fire(action)}
          >
            {action.label}
          </button>
        ))}
      </div>

      {actionStatus && (
        <div
          id={`status-${actionStatus.status}`}
          role="status"
          data-aiwa-id={`status-${actionStatus.status}`}
          data-aiwa-status={actionStatus.status}
          className="images__status"
        >
          {actionStatus.message}
        </div>
      )}
    </div>
  );
}
