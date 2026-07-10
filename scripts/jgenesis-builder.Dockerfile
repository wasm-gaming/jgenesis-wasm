FROM rust:bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        clang \
        lld \
    && rm -rf /var/lib/apt/lists/*

RUN rustup toolchain install nightly \
    && rustup +nightly target add wasm32-unknown-unknown \
    && rustup component add rust-src --toolchain nightly

RUN cargo install wasm-pack --locked
