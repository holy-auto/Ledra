// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import MediaUploadSection from "../MediaUploadSection";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const uploadToSignedUrl = vi.fn(async () => ({ data: { path: "p" }, error: null }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }),
}));

const PROPS = {
  publicId: "PID-123",
  existing: [],
};

function tinyFile(name: string, type: string, size = 12) {
  return new File([new Uint8Array(size)], name, { type });
}

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MediaUploadSection", () => {
  it("renders with default media_type = video and shows poster slot", () => {
    render(<MediaUploadSection {...PROPS} />);
    expect(screen.getByText("動画 / Before-After")).toBeDefined();
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("video");
    expect(screen.getByText("動画ファイル (MP4 / MOV)")).toBeDefined();
    expect(screen.getByText("ポスター画像 (任意・JPEG / PNG)")).toBeDefined();
  });

  it("switches inputs when media_type changes to before_after", () => {
    render(<MediaUploadSection {...PROPS} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "before_after" } });
    expect(screen.getByText("After 画像 (JPEG / PNG)")).toBeDefined();
    expect(screen.getByText("Before 画像 (JPEG / PNG)")).toBeDefined();
    expect(screen.queryByText("ポスター画像 (任意・JPEG / PNG)")).toBeNull();
  });

  it("rejects submission when no primary file is selected", () => {
    render(<MediaUploadSection {...PROPS} />);
    fireEvent.click(screen.getByText("メディアを追加"));
    expect(screen.getByText("動画ファイルを選択してください。")).toBeDefined();
  });

  it("rejects before_after submission when before image is missing", () => {
    render(<MediaUploadSection {...PROPS} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "before_after" } });

    const fileInputs = document.querySelectorAll("input[type='file']") as NodeListOf<HTMLInputElement>;
    fireEvent.change(fileInputs[0], { target: { files: [tinyFile("after.jpg", "image/jpeg")] } });

    fireEvent.click(screen.getByText("メディアを追加"));
    expect(screen.getByText("Before 画像を選択してください。")).toBeDefined();
  });

  it("動画は Storage へ直接アップロードしてから、保存パスだけを登録する（Vercel の本文上限を通さない）", async () => {
    const path = "media/t1/c1/1700000000000_main.mp4";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, path, token: "tok" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, media: { id: "mm" } }) });
    global.fetch = fetchMock;

    render(<MediaUploadSection {...PROPS} />);
    const fileInputs = document.querySelectorAll("input[type='file']") as NodeListOf<HTMLInputElement>;
    fireEvent.change(fileInputs[0], { target: { files: [tinyFile("clip.mp4", "video/mp4")] } });

    await act(async () => {
      fireEvent.click(screen.getByText("メディアを追加"));
      await Promise.resolve();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [urlUrl, urlInit] = fetchMock.mock.calls[0];
    expect(urlUrl).toBe("/api/certificates/PID-123/media/upload-url");
    expect(JSON.parse(urlInit.body)).toEqual({ content_type: "video/mp4", size: 12 });
    expect(uploadToSignedUrl).toHaveBeenCalledWith(path, "tok", expect.any(File), { contentType: "video/mp4" });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/certificates/PID-123/media");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("media_type")).toBe("video");
    expect(body.get("primary_path")).toBe(path);
    expect(body.get("file")).toBeNull();
  });

  it("登録が一時的に失敗したら、同じファイルの再試行では動画を送り直さず登録だけやり直す。中身不正で消されたら送り直す", async () => {
    const path = "media/t1/c1/1700000000000_main.mp4";
    const urlOk = { ok: true, status: 200, json: async () => ({ ok: true, path, token: "tok" }) };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(urlOk)
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ message: "一時的" }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: "不正", discarded: true }) })
      .mockResolvedValueOnce(urlOk)
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ message: "登録済み" }) });
    global.fetch = fetchMock;
    uploadToSignedUrl.mockClear();

    render(<MediaUploadSection {...PROPS} />);
    const fileInputs = document.querySelectorAll("input[type='file']") as NodeListOf<HTMLInputElement>;
    fireEvent.change(fileInputs[0], { target: { files: [tinyFile("clip.mp4", "video/mp4")] } });
    const send = async (calls: number) => {
      await act(async () => {
        fireEvent.click(screen.getByText("メディアを追加"));
        await Promise.resolve();
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(calls));
    };

    await send(2); // upload-url + 登録（503）
    await waitFor(() => expect(screen.getByText("一時的")).toBeDefined());
    await send(3); // 登録だけ（400 discarded）
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("不正")).toBeDefined());
    await send(5); // 送り直し: upload-url + 登録（409 = 登録済みは成功扱い）
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByText("動画 を追加しました。")).toBeDefined());
  });

  it("renders a delete button per existing media row", () => {
    const existing = [
      {
        id: "m1",
        media_type: "video" as const,
        caption: "施工タイムラプス",
        url: "https://signed/main",
        before_url: null,
        poster_url: "https://signed/poster",
        sort_order: 0,
      },
    ];
    render(<MediaUploadSection publicId="PID-1" existing={existing} />);
    expect(screen.getByText("施工タイムラプス")).toBeDefined();
    expect(screen.getByText("削除")).toBeDefined();
    // Tile shows the media kind label combined with the sort order
    expect(screen.getByText(/動画 · 順序 0/)).toBeDefined();
  });
});
