import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Step = 'hospital' | 'images' | 'payment';

interface Hospital {
  id: string;
  name: string;
}

interface ReceiveImage {
  id: string;
  hospitalId: string;
  name: string;
  modality: string;
  date: string;
  sizeMb: number;
  fee: number;
}

const HOSPITALS: Hospital[] = [
  { id: 'seoul', name: '서울병원' },
  { id: 'computer', name: '컴퓨터의원' },
];

const RECEIVE_IMAGES: ReceiveImage[] = [
  {
    id: 'seoul-knee',
    hospitalId: 'seoul',
    name: 'Knee (R)',
    modality: '자기공명영상검사(MRI)',
    date: '2026.03.20',
    sizeMb: 57.38,
    fee: 10300,
  },
  {
    id: 'seoul-chest',
    hospitalId: 'seoul',
    name: 'Chest',
    modality: '일반사진(XC)',
    date: '2026.03.19',
    sizeMb: 18.42,
    fee: 7300,
  },
  {
    id: 'seoul-brain',
    hospitalId: 'seoul',
    name: 'Brain',
    modality: '컴퓨터단층촬영(CT)',
    date: '2026.03.17',
    sizeMb: 83.12,
    fee: 12600,
  },
  {
    id: 'computer-ct',
    hospitalId: 'computer',
    name: 'CT',
    modality: '컴퓨터단층촬영(CT)',
    date: '2026.03.16',
    sizeMb: 41.2,
    fee: 9300,
  },
];

export function ReceivePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('hospital');
  const [hospitalIds, setHospitalIds] = useState<Set<string>>(new Set());
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [showConsent, setShowConsent] = useState(false);
  const [agreements, setAgreements] = useState({
    refund: false,
  });
  const [paid, setPaid] = useState(false);

  const selectedHospitals = HOSPITALS.filter((hospital) => hospitalIds.has(hospital.id));
  const visibleImages = useMemo(
    () => RECEIVE_IMAGES.filter((image) => hospitalIds.has(image.hospitalId)),
    [hospitalIds],
  );
  const selectedImageItems = RECEIVE_IMAGES.filter((image) => selectedImages.has(image.id));
  const totalSize = selectedImageItems.reduce((sum, image) => sum + image.sizeMb, 0);
  const totalFee = selectedImageItems.reduce((sum, image) => sum + image.fee, 0);
  const readyToPay = selectedImages.size > 0 && agreements.refund;

  const toggleHospital = (id: string) => {
    setHospitalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleImage = (id: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const continueFromHospital = () => {
    if (hospitalIds.size === 0) return;
    setShowConsent(true);
  };

  const continueFromConsent = () => {
    setShowConsent(false);
    setStep('images');
  };

  const continueFromImages = () => {
    if (selectedImages.size === 0) return;
    setStep('payment');
  };

  const currentHospitalName = selectedHospitals[0]?.name ?? '선택한 병원';

  return (
    <div className="receive">
      <header className="receive__header">
        <button
          id="btn-receive-back"
          type="button"
          className="receive__back"
          aria-label="뒤로"
          onClick={() => {
            if (step === 'payment') setStep('images');
            else if (step === 'images') setStep('hospital');
            else history.back();
          }}
        >
          ←
        </button>
        <h1>내 영상 받기</h1>
        <span className="receive__step">
          {step === 'hospital' ? '1 / 3 병원 선택' : step === 'images' ? '2 / 3 영상 선택' : '3 / 3 결제'}
        </span>
      </header>
      <div className="receive__progress" aria-hidden="true">
        <span style={{ width: step === 'hospital' ? '33.333%' : step === 'images' ? '66.666%' : '100%' }} />
      </div>

      {step === 'hospital' && (
        <section className="receive__section">
          <h2>영상을 받을 병원을 선택해 주세요</h2>
          <label className="receive__search" htmlFor="receive-hospital-search">
            <span aria-hidden="true">⌕</span>
            <input
              id="receive-hospital-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="검색으로 찾기"
              aria-label="검색으로 찾기"
            />
          </label>

          <div className="receive__hospital-grid">
            {HOSPITALS.filter((hospital) => hospital.name.includes(query)).map((hospital) => (
              <label key={hospital.id} className="receive__choice">
                <input
                  id={`hospital-${hospital.id}`}
                  type="checkbox"
                  checked={hospitalIds.has(hospital.id)}
                  onChange={() => toggleHospital(hospital.id)}
                  aria-label={hospital.name}
                />
                <span>{hospital.name}</span>
              </label>
            ))}
          </div>

          <button
            id="btn-receive-hospital-next"
            type="button"
            className="receive__primary receive__bottom"
            disabled={hospitalIds.size === 0}
            onClick={continueFromHospital}
          >
            다음
          </button>
        </section>
      )}

      {step === 'images' && (
        <section className="receive__section receive__section--images">
          <h2>{currentHospitalName}에서 받으실 영상을 선택해 주세요</h2>

          <ul className="receive__image-list">
            {visibleImages.map((image) => (
              <li
                key={image.id}
                className={
                  selectedImages.has(image.id)
                    ? 'receive-image receive-image--selected'
                    : 'receive-image'
                }
              >
                <label className="receive-image__check">
                  <input
                    id={`receive-image-${image.id}`}
                    type="checkbox"
                    checked={selectedImages.has(image.id)}
                    onChange={() => toggleImage(image.id)}
                    aria-label={`${image.name} 선택`}
                  />
                </label>
                <div className="receive-image__body">
                  <div className="receive-image__title">
                    <strong>{image.name}</strong>
                    <span>신청가능</span>
                  </div>
                  <dl>
                    <dt>촬영 장비</dt>
                    <dd>{image.modality}</dd>
                    <dt>촬영 일자</dt>
                    <dd>{image.date}</dd>
                  </dl>
                </div>
              </li>
            ))}
          </ul>

          <div className="receive__summarybar">
            <span>~700MB: 10,300원/~4.59GB: 20,600원</span>
            <strong>{totalSize.toFixed(2)}MB</strong>
          </div>
          <div className="receive__bottom">
            <button
              id="btn-receive-select-images"
              type="button"
              className="receive__primary"
              disabled={selectedImages.size === 0}
              onClick={continueFromImages}
            >
              {selectedImages.size}건 선택하기
            </button>
          </div>
        </section>
      )}

      {step === 'payment' && (
        <section className="receive__section receive__section--payment">
          {paid ? (
            <div className="receive__complete">
              <h2>영상 받기 신청이 완료되었습니다</h2>
              <p>선택한 영상은 HScan 계정의 내 영상 목록에서 확인할 수 있습니다.</p>
              <button
                id="btn-receive-complete-home"
                type="button"
                className="receive__primary receive__complete-home"
                onClick={() => navigate('/')}
              >
                홈 화면으로 돌아가기
              </button>
            </div>
          ) : (
            <>
              <h2>결제 항목과 금액을 확인 후 아래에 체크해 주세요</h2>
              <p className="receive__notice">
                의료영상 발급은 비급여 항목으로, 의료기관별 발급 비용이 상이할 수 있습니다.
              </p>

              <div className="receive__payment-card">
                {selectedHospitals.map((hospital) => (
                  <div key={hospital.id} className="receive__payment-hospital">
                    <div className="receive__payment-title">
                      <strong>{hospital.name}</strong>
                      <button type="button">삭제</button>
                    </div>
                    <dl>
                      <dt>목록</dt>
                      <dd>
                        검사 {selectedImageItems.filter((image) => image.hospitalId === hospital.id).length}건
                        <br />
                        온라인 발급
                      </dd>
                      <dt>발급비</dt>
                      <dd>{formatWon(totalFee)} ~({totalSize.toFixed(2)}MB)</dd>
                    </dl>
                  </div>
                ))}
              </div>

              <div className="receive__agreements">
                <label className="receive__agree-all">
                  <input
                    id="agree-all"
                    type="checkbox"
                    checked={agreements.refund}
                    onChange={(event) =>
                      setAgreements({
                        refund: event.target.checked,
                      })
                    }
                  />
                  <span>전체 확인</span>
                </label>
                <label>
                  <input
                    id="agree-refund"
                    type="checkbox"
                    checked={agreements.refund}
                    onChange={() =>
                      setAgreements((prev) => ({ ...prev, refund: !prev.refund }))
                    }
                  />
                  <span>
                    의료영상은 제증명 자료에 해당하며, 결제 후 기술적 오류로 인한 발급 실패 이외의
                    경우에는 환불이 어려울 수 있습니다.
                  </span>
                </label>
              </div>

              <div className="receive__total">
                <span>총 결제금액(세금포함)</span>
                <strong>{formatWon(totalFee)}</strong>
              </div>

              <button
                id="btn-receive-pay"
                type="button"
                className="receive__primary receive__bottom"
                disabled={!readyToPay}
                onClick={() => setPaid(true)}
              >
                결제하기
              </button>
            </>
          )}
        </section>
      )}

      {showConsent && (
        <div className="receive-modal" role="dialog" aria-modal="true" aria-label="개인정보 동의">
          <div className="receive-modal__sheet">
            <button
              id="btn-consent-close"
              type="button"
              className="receive-modal__close"
              onClick={() => setShowConsent(false)}
              aria-label="닫기"
            >
              ×
            </button>
            <h2>의료영상 조회를 위해 개인정보 수집·이용에 동의해 주세요</h2>
            <p>
              해당 의료기관으로부터 고객님의 개인정보와 의료영상 수신·이용 동의가 필요합니다.
            </p>
            <div className="receive-modal__art" aria-hidden="true">
              👤
            </div>
            <button
              id="btn-consent-continue"
              type="button"
              className="receive__primary"
              onClick={continueFromConsent}
            >
              동의하고 계속하기
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function formatWon(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`;
}
