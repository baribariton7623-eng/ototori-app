/**
 * 音取りアプリの内部データ形式。
 * 階層: Work(作品) > Movement(楽章) > Part(パート) > NoteOrRest列
 * MusicXMLからの変換(scripts/musicxml)と、アプリのランタイム(src/)の両方が
 * この型定義を単一ソースとして共有する。
 */

/** 科学的音名表記。例: "C4", "F#5", "Bb3" */
export type PitchName = string;

export interface NoteEvent {
  type: 'note';
  pitch: PitchName;
  /** 四分音符=1.0とした拍数。タイで結ばれた音は変換時に合算済み */
  beats: number;
}

export interface RestEvent {
  type: 'rest';
  beats: number;
}

export type NoteOrRest = NoteEvent | RestEvent;

/** 曲中の一声部(例: "ソプラノ", "アルトI") */
export interface Part {
  id: string;
  label: string;
  /** 弱起分も含め、楽章開始位置からの直列イベント列 */
  events: NoteOrRest[];
}

/**
 * テンポ変更イベント。
 * atBeat は楽章内の絶対拍位置(四分音符=1の軸、弱起がある場合は
 * 最初の完全小節の頭が beat 0 になるよう、弱起中の音符は負の値を取る)。
 * bpm は「四分音符=1拍」換算で統一する(beatUnitとは独立)。
 */
export interface TempoEvent {
  atBeat: number;
  bpm: number;
}

export interface TimeSignature {
  /** 分子。例: 4/4なら4, 6/8なら6 */
  beats: number;
  /** 分母。例: 4/4なら4, 6/8なら8 */
  beatType: number;
}

export interface Movement {
  id: string;
  title: string;
  timeSignature: TimeSignature;
  /**
   * 基準BPMが「何を1拍として」定義されているかを四分音符換算で示す。
   * 通常は1(四分音符=1拍)。付点四分を1拍とする複合拍子曲では1.5などになる。
   */
  beatUnit: number;
  /** 曲頭の不完全小節(弱起)の拍数。ない場合はundefined */
  pickupBeats?: number;
  /** atBeat昇順。先頭要素は必ず atBeat: 楽章開始点のBPMを含む */
  tempoEvents: TempoEvent[];
  parts: Part[];
}

export interface WorkMeta {
  id: string;
  title: string;
  composer: string;
  /** 作曲家の生年(時代順ソート用)。不明な場合はundefined(一覧では末尾に表示) */
  composerSortKey?: number;
  movements: Array<{
    id: string;
    title: string;
    timeSignature: TimeSignature;
    baseBpm: number;
    /** シークバーの最大値算出用に変換時点で事前計算しておく */
    measureCount: number;
    partLabels: string[];
  }>;
}

export interface WorksIndex {
  works: WorkMeta[];
}

/** public/data/works/<workId>/<movementId>.json の中身 */
export interface MovementData {
  workId: string;
  workTitle: string;
  composer: string;
  movement: Movement;
}
