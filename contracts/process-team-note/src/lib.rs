//! Process Team Note Script (Cross-Context)
//!
//! This note delivers a player's team selection to the arena account.
//! Word arg = [c0, c1, c2, 0] where c0..c2 are champion IDs (0-9).
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
bindings::export!(ProcessTeamNote);

use bindings::{
    exports::miden::base::note_script::Guest,
    miden::arena_account::arena_account::set_team,
};

struct ProcessTeamNote;

impl Guest for ProcessTeamNote {
    fn run(arg: Word) {
        let sender = active_note::get_sender();
        set_team(sender.prefix, sender.suffix, arg[0], arg[1], arg[2]);
    }
}
