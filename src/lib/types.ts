export interface Profile {
  id: string;
  nickname: string;
  color: string;
}

export interface Preset {
  id: string;
  user_id: string;
  label: string;
  start_time: string;
  end_time: string;
  color: string;
  sort_order: number;
}

export interface Slot {
  id: string;
  user_id: string;
  date: string;
  start_time: string;
  end_time: string;
  preset_id: string | null;
}
