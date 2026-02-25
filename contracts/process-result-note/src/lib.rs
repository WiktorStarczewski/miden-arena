//! Process Result Note Script (Cross-Context)
//!
//! This note delivers a combat result from the combat account to matchmaking.
//! Note inputs: [winner_val] where 1=player_a, 2=player_b, 3=draw.
//! The sender is verified by matchmaking's receive_result to be the combat account.

#![no_std]
#![feature(alloc_error_handler)]

extern crate alloc;

#[global_allocator]
static ALLOC: miden::BumpAlloc = miden::BumpAlloc::new();

#[cfg(not(test))]
#[panic_handler]
fn my_panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}

#[cfg(not(test))]
#[alloc_error_handler]
fn my_alloc_error(_info: core::alloc::Layout) -> ! {
    loop {}
}

use miden::*;

miden::generate!();
bindings::export!(ProcessResultNote);

use bindings::{
    exports::miden::base::note_script::Guest,
    miden::matchmaking_account::matchmaking_account::{receive_asset, receive_result},
};

struct ProcessResultNote;

impl Guest for ProcessResultNote {
    fn run(_arg: Word) {
        let sender = active_note::get_sender();
        let inputs = active_note::get_inputs();
        let assets = active_note::get_assets();

        // Deposit dust asset into matchmaking vault
        if assets.len() == 1 {
            receive_asset(assets[0]);
        }

        // sender is the combat account — receive_result verifies this
        receive_result(sender.prefix, sender.suffix, inputs[0]);
    }
}
