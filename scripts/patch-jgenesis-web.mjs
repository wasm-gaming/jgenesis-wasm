#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function replaceOne(haystack, needle, replacement, label) {
  if (haystack.includes(replacement)) {
    return haystack; // already patched (idempotent re-run)
  }
  if (!haystack.includes(needle)) {
    throw new Error(`Patch anchor not found: ${label}`);
  }
  return haystack.replace(needle, replacement);
}

function patchConfigRs(text) {
  text = replaceOne(
    text,
    "use std::collections::VecDeque;\n",
    "use std::collections::VecDeque;\nuse js_sys::Uint8Array;\n",
    'config.rs import Uint8Array',
  );

  text = replaceOne(
    text,
    "    UploadSaveFile,\n    ConfigureInput { name: String },\n",
    "    UploadSaveFile,\n    OpenRomBytes {\n        rom: Vec<u8>,\n        rom_file_name: String,\n    },\n    ConfigureInput { name: String },\n",
    'config.rs EmulatorCommand::OpenRomBytes',
  );

  text = replaceOne(
    text,
    "    pub fn request_upload_save_file(&self) {\n        self.commands.borrow_mut().push_back(EmulatorCommand::UploadSaveFile);\n    }\n\n    pub fn request_configure_input(&self, name: &str) {\n",
    "    pub fn request_upload_save_file(&self) {\n        self.commands.borrow_mut().push_back(EmulatorCommand::UploadSaveFile);\n    }\n\n    pub fn request_open_rom_bytes(&self, rom: Uint8Array, rom_file_name: &str) {\n        self.commands.borrow_mut().push_back(EmulatorCommand::OpenRomBytes {\n            rom: rom.to_vec(),\n            rom_file_name: rom_file_name.into(),\n        });\n    }\n\n    pub fn request_configure_input(&self, name: &str) {\n",
    'config.rs request_open_rom_bytes',
  );

  text = replaceOne(
    text,
    "use genesis_config::{\n    GenesisAspectRatio, GenesisButton, GenesisInputs, Opn2BusyBehavior, PcmInterpolation,\n    S32XColorTint, S32XPwmResampling, S32XVideoOut, S32XVoidColor,\n};\n",
    "use genesis_config::{\n    GenesisAspectRatio, GenesisButton, GenesisInputs, GenesisRegion, Opn2BusyBehavior,\n    PcmInterpolation, S32XColorTint, S32XPwmResampling, S32XVideoOut, S32XVoidColor,\n};\n",
    'config.rs import GenesisRegion',
  );

  text = replaceOne(
    text,
    "use smsgg_config::{GgAspectRatio, SmsAspectRatio, SmsGgButton, SmsGgInputs, SmsModel};\n",
    "use smsgg_config::{GgAspectRatio, SmsAspectRatio, SmsGgButton, SmsGgInputs, SmsGgRegion, SmsModel};\n",
    'config.rs import SmsGgRegion',
  );

  text = replaceOne(
    text,
    "#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]\npub struct SmsGgWebConfig {\n    timing_mode: TimingMode,\n    sms_aspect_ratio: SmsAspectRatio,\n    gg_aspect_ratio: GgAspectRatio,\n    remove_sprite_limit: bool,\n    sms_crop_vertical_border: bool,\n    sms_crop_left_border: bool,\n    fm_unit_enabled: bool,\n}\n",
    "#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]\npub struct SmsGgWebConfig {\n    timing_mode: TimingMode,\n    forced_region: Option<SmsGgRegion>,\n    sms_aspect_ratio: SmsAspectRatio,\n    gg_aspect_ratio: GgAspectRatio,\n    remove_sprite_limit: bool,\n    sms_crop_vertical_border: bool,\n    sms_crop_left_border: bool,\n    fm_unit_enabled: bool,\n}\n",
    'config.rs SmsGgWebConfig field',
  );

  text = replaceOne(
    text,
    "            timing_mode: TimingMode::default(),\n            sms_aspect_ratio: SmsAspectRatio::default(),\n            gg_aspect_ratio: GgAspectRatio::default(),\n            remove_sprite_limit: false,\n",
    "            timing_mode: TimingMode::default(),\n            forced_region: None,\n            sms_aspect_ratio: SmsAspectRatio::default(),\n            gg_aspect_ratio: GgAspectRatio::default(),\n            remove_sprite_limit: false,\n",
    'config.rs SmsGgWebConfig default forced_region',
  );

  text = replaceOne(
    text,
    "            forced_psg_version: None,\n            sms_aspect_ratio: self.sms_aspect_ratio,\n            gg_aspect_ratio: self.gg_aspect_ratio,\n            forced_region: None,\n            remove_sprite_limit: self.remove_sprite_limit,\n",
    "            forced_psg_version: None,\n            sms_aspect_ratio: self.sms_aspect_ratio,\n            gg_aspect_ratio: self.gg_aspect_ratio,\n            forced_region: self.forced_region,\n            remove_sprite_limit: self.remove_sprite_limit,\n",
    'config.rs SmsGgWebConfig forced_region to_emulator_config',
  );

  text = replaceOne(
    text,
    "#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]\npub struct GenesisWebConfig {\n    aspect_ratio: GenesisAspectRatio,\n    remove_sprite_limits: bool,\n    non_linear_color_scale: bool,\n    lpf_enabled: bool,\n    render_vertical_border: bool,\n    render_horizontal_border: bool,\n    m68k_divider: u64,\n}\n",
    "#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]\npub struct GenesisWebConfig {\n    aspect_ratio: GenesisAspectRatio,\n    forced_region: Option<GenesisRegion>,\n    remove_sprite_limits: bool,\n    non_linear_color_scale: bool,\n    lpf_enabled: bool,\n    render_vertical_border: bool,\n    render_horizontal_border: bool,\n    m68k_divider: u64,\n}\n",
    'config.rs GenesisWebConfig field',
  );

  text = replaceOne(
    text,
    "            aspect_ratio: GenesisAspectRatio::default(),\n            remove_sprite_limits: false,\n            non_linear_color_scale: true,\n            lpf_enabled: true,\n",
    "            aspect_ratio: GenesisAspectRatio::default(),\n            forced_region: None,\n            remove_sprite_limits: false,\n            non_linear_color_scale: true,\n            lpf_enabled: true,\n",
    'config.rs GenesisWebConfig default forced_region',
  );

  text = replaceOne(
    text,
    "        GenesisEmulatorConfig {\n            forced_timing_mode: None,\n            forced_region: None,\n            allow_opposing_joypad_directions: false,\n",
    "        GenesisEmulatorConfig {\n            forced_timing_mode: None,\n            forced_region: self.forced_region,\n            allow_opposing_joypad_directions: false,\n",
    'config.rs GenesisWebConfig forced_region to_emulator_config',
  );

  text = replaceOne(
    text,
    "    pub fn sms_timing_mode(&self) -> String {\n        self.borrow().smsgg.timing_mode.to_string()\n    }\n\n    pub fn set_sms_timing_mode(&self, timing_mode: &str) {\n        let Ok(timing_mode) = timing_mode.parse() else { return };\n        self.borrow_mut().smsgg.timing_mode = timing_mode;\n    }\n",
    "    pub fn sms_timing_mode(&self) -> String {\n        self.borrow().smsgg.timing_mode.to_string()\n    }\n\n    pub fn set_sms_timing_mode(&self, timing_mode: &str) {\n        let Ok(timing_mode) = timing_mode.parse() else { return };\n        self.borrow_mut().smsgg.timing_mode = timing_mode;\n    }\n\n    pub fn sms_region(&self) -> String {\n        self.borrow().smsgg.forced_region.map_or_else(|| String::from(\"Auto\"), |region| region.to_string())\n    }\n\n    pub fn set_sms_region(&self, region: &str) {\n        self.borrow_mut().smsgg.forced_region = match region {\n            \"Auto\" => None,\n            other => other.parse().ok(),\n        };\n    }\n",
    'config.rs sms_region accessors',
  );

  text = replaceOne(
    text,
    "    pub fn set_genesis_aspect_ratio(&self, aspect_ratio: &str) {\n        let Ok(aspect_ratio) = aspect_ratio.parse() else { return };\n        self.borrow_mut().genesis.aspect_ratio = aspect_ratio;\n    }\n\n    pub fn genesis_remove_sprite_limits(&self) -> bool {\n",
    "    pub fn set_genesis_aspect_ratio(&self, aspect_ratio: &str) {\n        let Ok(aspect_ratio) = aspect_ratio.parse() else { return };\n        self.borrow_mut().genesis.aspect_ratio = aspect_ratio;\n    }\n\n    pub fn genesis_region(&self) -> String {\n        self.borrow().genesis.forced_region.map_or_else(|| String::from(\"Auto\"), |region| region.to_string())\n    }\n\n    pub fn set_genesis_region(&self, region: &str) {\n        self.borrow_mut().genesis.forced_region = match region {\n            \"Auto\" => None,\n            \"Americas\" => Some(GenesisRegion::Americas),\n            \"Japan\" => Some(GenesisRegion::Japan),\n            \"Europe\" => Some(GenesisRegion::Europe),\n            _ => None,\n        };\n    }\n\n    pub fn genesis_remove_sprite_limits(&self) -> bool {\n",
    'config.rs genesis_region accessors',
  );

  return text;
}

// The upstream audio pipeline shares wasm memory and SharedArrayBuffers with
// the AudioWorklet, which hard-requires cross-origin isolation. The single-
// thread build (compiled without +atomics) swaps in audio_single.rs, which
// streams samples over the worklet's MessagePort instead.
function patchLibRsAudioModule(text) {
  return replaceOne(
    text,
    'mod audio;\n',
    '#[cfg(target_feature = "atomics")]\nmod audio;\n#[cfg(not(target_feature = "atomics"))]\n#[path = "audio_single.rs"]\nmod audio;\n',
    'lib.rs cfg-gated audio module',
  );
}

function patchCargoToml(text) {
  return replaceOne(
    text,
    '    "ChannelCountMode",\n',
    '    "ChannelCountMode",\n    "MessagePort",\n    "MessageEvent",\n',
    'Cargo.toml web-sys MessagePort/MessageEvent features',
  );
}

const AUDIO_SINGLE_RS = `//! Single-threaded audio backend.
//!
//! The default backend (audio.rs) shares wasm memory and SharedArrayBuffers
//! with the AudioWorklet, which requires cross-origin isolation. This variant
//! streams samples to a plain-JS worklet processor over its MessagePort, and
//! the processor reports back how many samples it has consumed so the main
//! thread can estimate queue depth for dynamic resampling.

use js_sys::{Array, Float32Array};
use std::cell::{Cell, RefCell};
use std::rc::Rc;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    AudioContext, AudioWorkletNode, AudioWorkletNodeOptions, ChannelCountMode, MessageEvent,
    MessagePort,
};

pub const SAMPLE_RATE: u32 = 48000;
pub const BUFFER_LEN_SAMPLES: u32 = 8192;

// Samples (2 per stereo frame) accumulated before a postMessage flush.
// 256 samples = 128 frames = one worklet render quantum (~2.7ms at 48kHz).
const FLUSH_LEN_SAMPLES: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnqueueResult {
    Successful,
    BufferFull,
}

struct AudioQueueShared {
    port: RefCell<Option<MessagePort>>,
    pending: RefCell<Vec<f32>>,
    // Totals are f64 (not wrapping u32) so sent/consumed never disagree about
    // overflow; MessagePort payloads are JS numbers anyway.
    sent: Cell<f64>,
    consumed: Cell<f64>,
    onmessage: RefCell<Option<Closure<dyn FnMut(MessageEvent)>>>,
}

pub struct AudioQueue {
    shared: Rc<AudioQueueShared>,
}

impl Default for AudioQueue {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioQueue {
    pub fn new() -> Self {
        Self {
            shared: Rc::new(AudioQueueShared {
                port: RefCell::new(None),
                pending: RefCell::new(Vec::with_capacity(FLUSH_LEN_SAMPLES)),
                sent: Cell::new(0.0),
                consumed: Cell::new(0.0),
                onmessage: RefCell::new(None),
            }),
        }
    }

    pub fn push_if_space(
        &self,
        (sample_l, sample_r): (f32, f32),
    ) -> Result<EnqueueResult, JsValue> {
        if self.len()? + 2 > BUFFER_LEN_SAMPLES {
            return Ok(EnqueueResult::BufferFull);
        }

        let flush_needed = {
            let mut pending = self.shared.pending.borrow_mut();
            pending.push(sample_l);
            pending.push(sample_r);
            pending.len() >= FLUSH_LEN_SAMPLES
        };

        if flush_needed {
            self.flush()?;
        }

        Ok(EnqueueResult::Successful)
    }

    pub fn len(&self) -> Result<u32, JsValue> {
        let in_flight = (self.shared.sent.get() - self.shared.consumed.get()).max(0.0);
        Ok(in_flight as u32 + self.shared.pending.borrow().len() as u32)
    }

    fn flush(&self) -> Result<(), JsValue> {
        let port = self.shared.port.borrow();
        let Some(port) = port.as_ref() else { return Ok(()) };

        let mut pending = self.shared.pending.borrow_mut();
        if pending.is_empty() {
            return Ok(());
        }

        port.post_message(&Float32Array::from(pending.as_slice()))?;
        self.shared.sent.set(self.shared.sent.get() + pending.len() as f64);
        pending.clear();

        Ok(())
    }

    fn attach_port(&self, port: MessagePort) {
        let shared = Rc::clone(&self.shared);
        let onmessage = Closure::<dyn FnMut(MessageEvent)>::new(move |event: MessageEvent| {
            if let Some(consumed) = event.data().as_f64() {
                shared.consumed.set(consumed);
            }
        });
        port.set_onmessage(Some(onmessage.as_ref().unchecked_ref()));

        *self.shared.onmessage.borrow_mut() = Some(onmessage);
        *self.shared.port.borrow_mut() = Some(port);
    }
}

pub async fn initialize_audio_worklet(
    audio_ctx: &AudioContext,
    audio_queue: &AudioQueue,
) -> Result<AudioWorkletNode, JsValue> {
    // Random query parameter for the same Firefox caching reason as audio.rs.
    let module_url = format!("./js/audio-processor-single.js?r={}", rand::random::<u32>());
    JsFuture::from(audio_ctx.audio_worklet()?.add_module(&module_url)?).await?;

    let node_options = AudioWorkletNodeOptions::new();
    node_options.set_channel_count_mode(ChannelCountMode::Explicit);
    node_options.set_output_channel_count(&Array::of1(&JsValue::from(2)));

    let worklet_node =
        AudioWorkletNode::new_with_options(audio_ctx, "audio-processor", &node_options)?;
    worklet_node.connect_with_audio_node(&audio_ctx.destination())?;

    audio_queue.attach_port(worklet_node.port()?);

    Ok(worklet_node)
}
`;

const AUDIO_PROCESSOR_SINGLE_JS = `// Plain-JS AudioWorklet processor for the single-threaded (non-cross-origin-
// isolated) build. Samples arrive as Float32Array messages on the node port;
// the processor reports total consumed samples back so the main thread can
// estimate queue depth. No wasm, no SharedArrayBuffer.

const CAPACITY = 16384; // interleaved stereo samples; power of two, 2x the main-thread queue

class JgenesisSingleThreadAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        this.buffer = new Float32Array(CAPACITY);
        this.start = 0;
        this.end = 0;
        this.len = 0;
        this.consumed = 0;
        this.lastReportedConsumed = -1;

        this.port.onmessage = (event) => {
            const samples = event.data;
            for (let i = 0; i < samples.length; i++) {
                if (this.len === CAPACITY) {
                    // Overflow: count dropped samples as consumed so the
                    // main-thread depth estimate doesn't inflate forever.
                    this.consumed++;
                    continue;
                }
                this.buffer[this.end] = samples[i];
                this.end = (this.end + 1) & (CAPACITY - 1);
                this.len++;
            }
        };
    }

    process(inputs, outputs) {
        const outL = outputs[0][0];
        const outR = outputs[0][1];

        const frames = Math.min(outL.length, this.len >> 1);
        for (let i = 0; i < frames; i++) {
            outL[i] = this.buffer[this.start];
            this.start = (this.start + 1) & (CAPACITY - 1);
            outR[i] = this.buffer[this.start];
            this.start = (this.start + 1) & (CAPACITY - 1);
        }
        this.len -= frames * 2;
        this.consumed += frames * 2;

        if (this.consumed !== this.lastReportedConsumed) {
            this.port.postMessage(this.consumed);
            this.lastReportedConsumed = this.consumed;
        }

        return true;
    }
}

registerProcessor("audio-processor", JgenesisSingleThreadAudioProcessor);
`;

function patchLibRs(text) {
  text = patchLibRsAudioModule(text);

  text = replaceOne(
    text,
    "    web_sys::window()\n        .and_then(|window| window.document())\n        .and_then(|document| {\n            let dst = document.get_element_by_id(\"jgenesis-wasm\")?;\n            let canvas = web_sys::Element::from(window.canvas()?);\n            dst.append_child(&canvas).ok()?;\n            Some(())\n        })\n        .expect(\"Unable to append canvas to document\");\n",
    "    let document = web_sys::window()\n        .and_then(|window| window.document())\n        .expect(\"Unable to access document\");\n\n    let dst = document\n        .get_element_by_id(\"jgenesis-wasm\")\n        .or_else(|| document.body().map(web_sys::Element::from))\n        .expect(\"Unable to find DOM mount target\");\n\n    let canvas =\n        web_sys::Element::from(window.canvas().expect(\"Unable to get window canvas\"));\n    dst.append_child(&canvas).expect(\"Unable to append canvas to document\");\n",
    'lib.rs mount target fallback',
  );

  text = replaceOne(
    text,
    "                EmulatorCommand::UploadSaveFile => {\n                    wasm_bindgen_futures::spawn_local(upload_save_file(event_loop_proxy.clone()));\n                }\n                EmulatorCommand::Reset => {\n",
    "                EmulatorCommand::UploadSaveFile => {\n                    wasm_bindgen_futures::spawn_local(upload_save_file(event_loop_proxy.clone()));\n                }\n                EmulatorCommand::OpenRomBytes { rom, rom_file_name } => {\n                    wasm_bindgen_futures::spawn_local(open_rom_bytes(\n                        event_loop_proxy.clone(),\n                        rom,\n                        rom_file_name,\n                    ));\n                }\n                EmulatorCommand::Reset => {\n",
    'lib.rs handle OpenRomBytes command',
  );

  text = replaceOne(
    text,
    "async fn open_bios(key: &str, supported_extensions: &[&str]) {\n",
    "async fn open_rom_bytes(\n    event_loop_proxy: EventLoopProxy<JgenesisUserEvent>,\n    rom: Vec<u8>,\n    rom_file_name: String,\n) {\n    let extension = Path::new(&rom_file_name)\n        .extension()\n        .map(|ext| ext.to_string_lossy().to_ascii_lowercase());\n\n    let bios_rom = match extension.as_deref() {\n        Some(\"chd\") => {\n            let Some(bios_rom) = read_bios_from_idb(SCD_BIOS_KEY).await else {\n                js::alert(\"Sega CD emulation requires a Sega CD BIOS ROM to be configured\");\n                return;\n            };\n            Some(bios_rom)\n        }\n        Some(\"gba\") => {\n            let Some(bios_rom) = read_bios_from_idb(GBA_BIOS_KEY).await else {\n                js::alert(\"GBA emulation requires a GBA BIOS ROM to be configured\");\n                return;\n            };\n            Some(bios_rom)\n        }\n        _ => None,\n    };\n\n    let save_files = save::load_all(&rom_file_name).await;\n\n    event_loop_proxy\n        .send_event(JgenesisUserEvent::FileOpen { rom, bios_rom, rom_file_name, save_files })\n        .expect(\"Unable to send file opened event\");\n}\n\nasync fn open_bios(key: &str, supported_extensions: &[&str]) {\n",
    'lib.rs open_rom_bytes helper',
  );

  return text;
}

function patchFile(filePath, patcher) {
  const before = fs.readFileSync(filePath, 'utf8');
  const after = patcher(before);
  fs.writeFileSync(filePath, after, 'utf8');
}

function main() {
  const repoRoot = process.argv[2];
  if (!repoRoot) {
    throw new Error('Usage: patch-jgenesis-web.mjs <jgenesis-repo-root>');
  }

  const configRs = path.join(repoRoot, 'frontend/jgenesis-web/src/config.rs');
  const libRs = path.join(repoRoot, 'frontend/jgenesis-web/src/lib.rs');
  const cargoToml = path.join(repoRoot, 'frontend/jgenesis-web/Cargo.toml');

  patchFile(configRs, patchConfigRs);
  patchFile(libRs, patchLibRs);
  patchFile(cargoToml, patchCargoToml);

  fs.writeFileSync(
    path.join(repoRoot, 'frontend/jgenesis-web/src/audio_single.rs'),
    AUDIO_SINGLE_RS,
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'frontend/jgenesis-web/js/audio-processor-single.js'),
    AUDIO_PROCESSOR_SINGLE_JS,
    'utf8',
  );
}

try {
  main();
} catch (err) {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
}
