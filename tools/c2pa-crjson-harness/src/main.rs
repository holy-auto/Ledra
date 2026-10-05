//! Ledra crJSON test harness (C2PA Conformance Program v0.2, Additional Requirement §2.3).
//!
//! Usage: c2pa-crjson-harness <asset> <c2pa-trust-list.pem> <tsa-trust-list.pem> <validation-time>
//! Validates <asset> as of <validation-time> (RFC 3339) and prints the results in crJSON to stdout.
use c2pa::{crypto::cose::CertificateTrustPolicy, harness_overrides, Context, Reader, Settings};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [asset, trust_list, tsa_trust_list, time] = args.as_slice() else {
        eprintln!("usage: c2pa-crjson-harness <asset> <c2pa-trust-list.pem> <tsa-trust-list.pem> <validation-time RFC 3339>");
        std::process::exit(2);
    };

    let time = chrono::DateTime::parse_from_rfc3339(time)?.with_timezone(&chrono::Utc);
    harness_overrides::VALIDATION_TIME
        .set(time)
        .expect("set once");

    // Time-stamp certificates are checked only against the TSA trust list, claim signers only against the C2PA list.
    let mut tsa = CertificateTrustPolicy::new();
    tsa.add_trust_anchors(&std::fs::read(tsa_trust_list)?)?;
    harness_overrides::TSA_TRUST_POLICY
        .set(tsa)
        .expect("set once");

    // An empty list means "no trust anchors"; c2pa-rs rejects an empty PEM string rather than treating it so.
    let anchors = std::fs::read_to_string(trust_list)?;
    let settings = match anchors.trim() {
        "" => Settings::new(),
        _ => Settings::new().with_value("trust.trust_anchors", anchors)?,
    };
    let reader = Reader::from_context(Context::new().with_settings(settings)?).with_file(asset)?;
    println!("{}", reader.crjson_checked()?);
    Ok(())
}
