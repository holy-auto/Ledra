"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import PageHeader from "@/components/ui/PageHeader";
import EquipmentPicker from "@/components/EquipmentPicker";

/* ---------- constants ---------- */
const TRANSMISSIONS = ["AT", "MT", "CVT"] as const;
const DRIVE_TYPES = ["FF", "FR", "4WD", "AWD"] as const;
const FUEL_TYPES = ["ガソリン", "ディーゼル", "ハイブリッド", "EV"] as const;
const BODY_TYPES = ["セダン", "SUV", "ミニバン", "軽", "クーペ", "ワゴン", "トラック", "その他"] as const;
const REPAIR_HISTORY = ["なし", "あり", "不明"] as const;
const CONDITION_GRADES = ["S", "A", "B", "C", "D"] as const;
const MAX_IMAGES = 20;

/* ---------- helpers ---------- */
interface ImageFile {
  file: File;
  preview: string;
}

/* ---------- component ---------- */
export default function NewVehicleForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // 基本情報
  const [maker, setMaker] = useState("");
  const [model, setModel] = useState("");
  const [grade, setGrade] = useState("");
  const [year, setYear] = useState("");
  const [mileage, setMileage] = useState("");
  const [color, setColor] = useState("");
  const [colorCode, setColorCode] = useState("");

  // 車両識別
  const [plateNumber, setPlateNumber] = useState("");
  const [chassisNumber, setChassisNumber] = useState("");

  // スペック
  const [engineType, setEngineType] = useState("");
  const [displacement, setDisplacement] = useState("");
  const [transmission, setTransmission] = useState("");
  const [driveType, setDriveType] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [doorCount, setDoorCount] = useState("");
  const [seatingCapacity, setSeatingCapacity] = useState("");
  const [bodyType, setBodyType] = useState("");

  // コンディション
  const [inspectionDate, setInspectionDate] = useState("");
  const [repairHistory, setRepairHistory] = useState("");
  const [conditionGrade, setConditionGrade] = useState("");
  const [conditionNote, setConditionNote] = useState("");

  // 価格・仕入
  const [askingPrice, setAskingPrice] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");

  // 写真
  const [images, setImages] = useState<ImageFile[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // 説明・装備
  const [description, setDescription] = useState("");
  const [features, setFeatures] = useState<string[]>([]);

  // OCR
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState<string | null>(null);

  // Submit state
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  /* ---------- OCR ---------- */
  async function onOcrFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrBusy(true);
    setOcrMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/vehicles/parse-shakken", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) {
        setOcrMsg(j?.message || "車検証の読み取りに失敗しました。");
        return;
      }
      const x = j.extracted;
      if (x.maker) setMaker(x.maker);
      if (x.model) setModel(x.model);
      if (x.year) setYear(String(x.year));
      if (x.vin_code) setChassisNumber(x.vin_code);
      if (x.plate_display) setPlateNumber(x.plate_display);
      setOcrMsg("✓ 車検証から情報を取り込みました。内容を確認してください。");
    } catch (e: unknown) {
      setOcrMsg(e instanceof Error ? e.message : "通信エラーが発生しました。");
    } finally {
      setOcrBusy(false);
      if (ocrInputRef.current) ocrInputRef.current.value = "";
    }
  }

  /* ---------- image handling ---------- */
  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setImages((prev) => {
      const remaining = MAX_IMAGES - prev.length;
      const toAdd = arr.slice(0, remaining).map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));
      return [...prev, ...toAdd];
    });
  }, []);

  const removeImage = (idx: number) => {
    setImages((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[idx].preview);
      next.splice(idx, 1);
      return next;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  /* ---------- submit ---------- */
  const handleSubmit = async () => {
    if (!maker.trim() || !model.trim()) {
      setErrMsg("メーカーと車名は必須です。");
      return;
    }
    setSaving(true);
    setErrMsg(null);
    try {
      // 1. Create vehicle record
      const body: Record<string, unknown> = {
        maker: maker.trim(),
        model: model.trim(),
        grade: grade.trim() || null,
        year: year ? parseInt(year, 10) : null,
        mileage: mileage ? parseInt(mileage, 10) : null,
        color: color.trim() || null,
        color_code: colorCode.trim() || null,
        plate_number: plateNumber.trim() || null,
        chassis_number: chassisNumber.trim() || null,
        engine_type: engineType.trim() || null,
        displacement: displacement ? parseInt(displacement, 10) : null,
        transmission: transmission || null,
        drive_type: driveType || null,
        fuel_type: fuelType || null,
        door_count: doorCount ? parseInt(doorCount, 10) : null,
        seating_capacity: seatingCapacity ? parseInt(seatingCapacity, 10) : null,
        body_type: bodyType || null,
        inspection_date: inspectionDate || null,
        repair_history: repairHistory || null,
        condition_grade: conditionGrade || null,
        condition_note: conditionNote.trim() || null,
        asking_price: askingPrice ? parseInt(askingPrice, 10) : null,
        wholesale_price: wholesalePrice ? parseInt(wholesalePrice, 10) : null,
        cost_price: costPrice ? parseInt(costPrice, 10) : null,
        supplier_name: supplierName.trim() || null,
        acquisition_date: acquisitionDate || null,
        description: description.trim() || null,
        features: features.length > 0 ? features : null,
      };

      const res = await fetch("/api/admin/market-vehicles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch((): null => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);

      const vehicleId = j.vehicle?.id ?? j.id;

      // 2. Upload images
      if (images.length > 0 && vehicleId) {
        const formData = new FormData();
        images.forEach((img) => formData.append("images", img.file));
        const imgRes = await fetch(`/api/admin/market-vehicles/${vehicleId}/images`, {
          method: "POST",
          body: formData,
        });
        if (!imgRes.ok) {
          const imgJ = await imgRes.json().catch((): null => null);
          console.error("Image upload failed:", imgJ?.error ?? imgRes.status);
        }
      }

      router.push("/admin/market-vehicles");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  /* ---------- section helper ---------- */
  const SectionTitle = ({ tag, title }: { tag: string; title: string }) => (
    <div className="pt-2">
      <div className="text-xs font-semibold tracking-[0.18em] text-muted">{tag}</div>
      <div className="mt-1 text-base font-semibold text-primary">{title}</div>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        tag="MARKET VEHICLES"
        title="新規車両登録"
        description="BtoB在庫に新しい車両を登録します。"
        actions={
          <button type="button" className="btn-ghost" onClick={() => router.push("/admin/market-vehicles")}>
            一覧に戻る
          </button>
        }
      />

      {errMsg && <div className="glass-card p-4 text-sm text-danger">{errMsg}</div>}

      {/* 車検証 OCR — 一時非表示 */}
      {false && (
        <section className="glass-card p-5 space-y-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">QUICK FILL</div>
            <div className="mt-1 text-base font-semibold text-primary">車検証から自動入力</div>
            <p className="mt-1 text-sm text-secondary">
              車検証を撮影またはアップロードすると、メーカー・車名・年式・車台番号・ナンバーを自動入力します。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={ocrBusy}
              onClick={() => {
                if (ocrInputRef.current) {
                  ocrInputRef.current.removeAttribute("multiple");
                  ocrInputRef.current.setAttribute("capture", "environment");
                  ocrInputRef.current.click();
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-surface px-4 py-2 text-sm font-medium text-secondary shadow-sm hover:bg-surface-hover transition-colors disabled:opacity-50"
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
                />
              </svg>
              {ocrBusy ? "読み取り中..." : "カメラで撮影"}
            </button>
            <button
              type="button"
              disabled={ocrBusy}
              onClick={() => {
                if (ocrInputRef.current) {
                  ocrInputRef.current.removeAttribute("capture");
                  ocrInputRef.current.click();
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-surface px-4 py-2 text-sm font-medium text-secondary shadow-sm hover:bg-surface-hover transition-colors disabled:opacity-50"
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                />
              </svg>
              ファイルを選択
            </button>
          </div>
          <input
            ref={ocrInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={onOcrFileChange}
          />
          {ocrMsg != null && (
            <p className={`text-sm ${ocrMsg!.startsWith("✓") ? "text-success-text" : "text-danger"}`}>{ocrMsg}</p>
          )}
        </section>
      )}

      {/* 基本情報 */}
      <section className="glass-card p-5 space-y-4">
        <SectionTitle tag="BASIC INFO" title="基本情報" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted">
              メーカー <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="例: トヨタ"
              value={maker}
              onChange={(e) => setMaker(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">
              車名 <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="例: プリウス"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">グレード</label>
            <input
              type="text"
              className="input-field"
              placeholder="例: S ツーリングセレクション"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">年式</label>
            <input
              type="number"
              className="input-field"
              placeholder="例: 2022"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">走行距離 (km)</label>
            <input
              type="number"
              className="input-field"
              placeholder="例: 35000"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">色</label>
            <input
              type="text"
              className="input-field"
              placeholder="例: パールホワイト"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">カラーコード</label>
            <input
              type="text"
              className="input-field"
              placeholder="例: 070"
              value={colorCode}
              onChange={(e) => setColorCode(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* 車両識別 */}
      <section className="glass-card p-5 space-y-4">
        <SectionTitle tag="IDENTIFICATION" title="車両識別" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted">ナンバープレート</label>
            <input
              type="text"
              className="input-field"
              placeholder="例: 品川 300 あ 1234"
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">車台番号</label>
            <input
              type="text"
              className="input-field"
              placeholder="例: ZVW50-1234567"
              value={chassisNumber}
              onChange={(e) => setChassisNumber(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* スペック */}
      <section className="glass-card p-5 space-y-4">
        <SectionTitle tag="SPECIFICATIONS" title="スペック" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted">エンジン型式</label>
            <input
              type="text"
              className="input-field"
              placeholder="例: 2ZR-FXE"
              value={engineType}
              onChange={(e) => setEngineType(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">排気量 (cc)</label>
            <input
              type="number"
              className="input-field"
              placeholder="例: 1800"
              value={displacement}
              onChange={(e) => setDisplacement(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">トランスミッション</label>
            <select className="select-field" value={transmission} onChange={(e) => setTransmission(e.target.value)}>
              <option value="">選択してください</option>
              {TRANSMISSIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">駆動方式</label>
            <select className="select-field" value={driveType} onChange={(e) => setDriveType(e.target.value)}>
              <option value="">選択してください</option>
              {DRIVE_TYPES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">燃料</label>
            <select className="select-field" value={fuelType} onChange={(e) => setFuelType(e.target.value)}>
              <option value="">選択してください</option>
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">ドア数</label>
            <input
              type="number"
              className="input-field"
              placeholder="例: 5"
              value={doorCount}
              onChange={(e) => setDoorCount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">乗車定員</label>
            <input
              type="number"
              className="input-field"
              placeholder="例: 5"
              value={seatingCapacity}
              onChange={(e) => setSeatingCapacity(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">ボディタイプ</label>
            <select className="select-field" value={bodyType} onChange={(e) => setBodyType(e.target.value)}>
              <option value="">選択してください</option>
              {BODY_TYPES.map((bt) => (
                <option key={bt} value={bt}>
                  {bt}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* コンディション */}
      <section className="glass-card p-5 space-y-4">
        <SectionTitle tag="CONDITION" title="コンディション" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted">車検満了日</label>
            <input
              type="date"
              className="input-field"
              value={inspectionDate}
              onChange={(e) => setInspectionDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">修復歴</label>
            <select className="select-field" value={repairHistory} onChange={(e) => setRepairHistory(e.target.value)}>
              <option value="">選択してください</option>
              {REPAIR_HISTORY.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">評価点</label>
            <select className="select-field" value={conditionGrade} onChange={(e) => setConditionGrade(e.target.value)}>
              <option value="">選択してください</option>
              {CONDITION_GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted">コンディション備考</label>
          <textarea
            className="input-field"
            rows={3}
            placeholder="傷・凹み・修理箇所などの詳細"
            value={conditionNote}
            onChange={(e) => setConditionNote(e.target.value)}
          />
        </div>
      </section>

      {/* 価格・仕入 */}
      <section className="glass-card p-5 space-y-4">
        <SectionTitle tag="PRICING & COST" title="価格・仕入" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted">販売価格 (税込)</label>
            <input
              type="number"
              className="input-field"
              placeholder="例: 2500000"
              value={askingPrice}
              onChange={(e) => setAskingPrice(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">卸価格</label>
            <input
              type="number"
              className="input-field"
              placeholder="例: 2200000"
              value={wholesalePrice}
              onChange={(e) => setWholesalePrice(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">仕入原価</label>
            <input
              type="number"
              className="input-field"
              placeholder="例: 1800000"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">仕入先</label>
            <input
              type="text"
              className="input-field"
              placeholder="例: オートオークション AA"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">仕入日</label>
            <input
              type="date"
              className="input-field"
              value={acquisitionDate}
              onChange={(e) => setAcquisitionDate(e.target.value)}
            />
          </div>
        </div>
        {/* Profit preview */}
        {costPrice && askingPrice && (
          <div className="rounded-lg border border-border-subtle bg-surface-hover p-3">
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-xs text-muted">販売利益</span>
                <div
                  className={`font-semibold ${parseInt(askingPrice) - parseInt(costPrice) >= 0 ? "text-success" : "text-danger"}`}
                >
                  ¥{(parseInt(askingPrice) - parseInt(costPrice)).toLocaleString()}
                </div>
              </div>
              <div>
                <span className="text-xs text-muted">利益率</span>
                <div
                  className={`font-semibold ${parseInt(askingPrice) - parseInt(costPrice) >= 0 ? "text-success" : "text-danger"}`}
                >
                  {(((parseInt(askingPrice) - parseInt(costPrice)) / parseInt(askingPrice)) * 100).toFixed(1)}%
                </div>
              </div>
              {wholesalePrice && (
                <div>
                  <span className="text-xs text-muted">卸利益</span>
                  <div
                    className={`font-semibold ${parseInt(wholesalePrice) - parseInt(costPrice) >= 0 ? "text-success" : "text-danger"}`}
                  >
                    ¥{(parseInt(wholesalePrice) - parseInt(costPrice)).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 写真 */}
      <section className="glass-card p-5 space-y-4">
        <SectionTitle tag="PHOTOS" title="写真" />
        <div
          className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragActive ? "border-accent bg-accent-dim" : "border-border-subtle hover:border-border-default"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div className="text-sm text-muted">写真を追加 (最大 {MAX_IMAGES} 枚)</div>
          <div className="mt-1 text-xs text-muted">
            {images.length}/{MAX_IMAGES} 枚アップロード済み
          </div>

          {/* Camera / Album buttons */}
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-surface px-4 py-2 text-sm font-medium text-secondary shadow-sm hover:bg-surface-hover hover:border-border-default transition-colors"
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
                />
              </svg>
              カメラで撮影
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-surface px-4 py-2 text-sm font-medium text-secondary shadow-sm hover:bg-surface-hover hover:border-border-default transition-colors"
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
                />
              </svg>
              アルバムから選択
            </button>
          </div>
          <div className="mt-2 text-xs text-muted opacity-60">ドラッグ&ドロップにも対応しています</div>

          {/* Camera input */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {/* Album input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {images.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2">
            {images.map((img, idx) => (
              <div key={idx} className="group relative aspect-square rounded-lg overflow-hidden bg-surface-hover">
                <Image src={img.preview} alt={`Upload ${idx + 1}`} fill className="object-cover" sizes="120px" />
                <button
                  type="button"
                  className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeImage(idx)}
                >
                  x
                </button>
                {idx === 0 && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center py-0.5">
                    メイン
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 説明・装備 */}
      <section className="glass-card p-5 space-y-4">
        <SectionTitle tag="DESCRIPTION" title="説明・装備" />
        <div className="space-y-1">
          <label className="text-xs text-muted">説明</label>
          <textarea
            className="input-field"
            rows={4}
            placeholder="車両の特徴やアピールポイント"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted">装備・オプション</label>
          <EquipmentPicker selected={features} onChange={setFeatures} />
        </div>
      </section>

      {/* Submit */}
      <div className="flex gap-3 pb-8">
        <button type="button" className="btn-primary" disabled={saving} onClick={handleSubmit}>
          {saving ? "登録中..." : "車両を登録"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => router.push("/admin/market-vehicles")}>
          キャンセル
        </button>
      </div>
    </div>
  );
}
