//! Process Stake Note Script (Cross-Context)
//!
//! This note delivers a player's stake to the arena account and triggers join.
//! Uses cross-context calling to invoke arena account procedures directly.

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
bindings::export!(ProcessStakeNote);

use bindings::{
    exports::miden::base::note_script::Guest,
    miden::arena_account::arena_account::{join, receive_asset},
};

struct ProcessStakeNote;

impl Guest for ProcessStakeNote {
    fn run(_arg: Word) {
        let sender = active_note::get_sender();
        let assets = active_note::get_assets();
        assert!(assets.len() == 1, "expected exactly one asset");

        let stake_asset = assets[0];
        let amount = stake_asset.inner[0];

        // Deposit asset into arena vault
        receive_asset(stake_asset);

        // Register player
        join(sender.prefix, sender.suffix, amount);
    }
}
