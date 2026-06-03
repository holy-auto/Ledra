import { describe, it, expect } from "vitest";
import * as asn1js from "asn1js";
import { buildTimeStampRequest, parseTimeStampResponse } from "@/lib/parts/rfc3161";

const SHA256_OID = "2.16.840.1.101.3.4.2.1";
const HASH = "a".repeat(64); // 32バイトのダミー SHA-256

function explicit0(inner: asn1js.AsnType): asn1js.Constructed {
  return new asn1js.Constructed({ idBlock: { tagClass: 3, tagNumber: 0 }, value: [inner] });
}

describe("buildTimeStampRequest", () => {
  it("version=1・SHA-256 OID・ハッシュ・certReq を含む DER を生成し再解析できる", () => {
    const der = buildTimeStampRequest(HASH, { certReq: true });
    const { result } = asn1js.fromBER(der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer);
    const seq = result as asn1js.Sequence;

    const version = seq.valueBlock.value[0] as asn1js.Integer;
    expect(Number(version.valueBlock.valueDec)).toBe(1);

    const imprint = seq.valueBlock.value[1] as asn1js.Sequence;
    const alg = imprint.valueBlock.value[0] as asn1js.Sequence;
    const oid = alg.valueBlock.value[0] as asn1js.ObjectIdentifier;
    expect(oid.valueBlock.toString()).toBe(SHA256_OID);

    const octet = imprint.valueBlock.value[1] as asn1js.OctetString;
    expect(Buffer.from(octet.valueBlock.valueHexView).toString("hex")).toBe(HASH);

    // 末尾は certReq=TRUE（nonce なし）
    const last = seq.valueBlock.value[seq.valueBlock.value.length - 1] as asn1js.Boolean;
    expect(last.valueBlock.value).toBe(true);
  });

  it("nonce を付けると INTEGER が1つ増える", () => {
    const nonce = new Uint8Array([1, 2, 3, 4]);
    const der = buildTimeStampRequest(HASH, { nonce });
    const { result } = asn1js.fromBER(der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer);
    const seq = result as asn1js.Sequence;
    // version, messageImprint, nonce(INTEGER), certReq(BOOLEAN)
    expect(seq.valueBlock.value.length).toBe(4);
  });

  it("不正な hex は拒否", () => {
    expect(() => buildTimeStampRequest("xyz")).toThrow();
  });
});

describe("parseTimeStampResponse", () => {
  function makeResponse(status: number, withToken: boolean, genTime?: Date): Uint8Array {
    const statusInfo = new asn1js.Sequence({ value: [new asn1js.Integer({ value: status })] });
    const value: asn1js.AsnType[] = [statusInfo];

    if (withToken) {
      const tstInfo = new asn1js.Sequence({
        value: [
          new asn1js.Integer({ value: 1 }),
          new asn1js.ObjectIdentifier({ value: "1.2.3.4" }),
          new asn1js.Sequence({ value: [] }),
          new asn1js.Integer({ value: 42 }),
          new asn1js.GeneralizedTime({ valueDate: genTime ?? new Date("2026-06-03T00:00:00Z") }),
        ],
      });
      const tstDer = tstInfo.toBER(false);
      const encap = new asn1js.Sequence({
        value: [
          new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.9.16.1.4" }),
          explicit0(new asn1js.OctetString({ valueHex: tstDer })),
        ],
      });
      const signedData = new asn1js.Sequence({
        value: [new asn1js.Integer({ value: 3 }), new asn1js.Set({ value: [] }), encap],
      });
      const contentInfo = new asn1js.Sequence({
        value: [new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.2" }), explicit0(signedData)],
      });
      value.push(contentInfo);
    }

    const resp = new asn1js.Sequence({ value });
    return new Uint8Array(resp.toBER(false));
  }

  it("granted(0) でトークンと genTime を取り出す", () => {
    const r = parseTimeStampResponse(makeResponse(0, true, new Date("2026-06-03T01:02:03Z")));
    expect(r.token.length).toBeGreaterThan(0);
    expect(r.genTime).toBe("2026-06-03T01:02:03.000Z");
  });

  it("grantedWithMods(1) も成功扱い", () => {
    expect(() => parseTimeStampResponse(makeResponse(1, true))).not.toThrow();
  });

  it("rejection(2) は例外", () => {
    expect(() => parseTimeStampResponse(makeResponse(2, false))).toThrow();
  });

  it("token 欠落は例外", () => {
    expect(() => parseTimeStampResponse(makeResponse(0, false))).toThrow();
  });
});
