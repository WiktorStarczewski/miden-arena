//! Init Combat Note Script (Cross-Context)
//!
//! This note initializes a combat account with game data from matchmaking.
//! Note inputs: [pa_prefix, pa_suffix, pb_prefix, pb_suffix,
//!               team_a_c0, team_a_c1, team_a_c2,
//!               team_b_c0, team_b_c1, team_b_c2]
//! Carries a dust asset (1 unit) to make the note valid.

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
bindings::export!(InitCombatNote);

use bindings::{
    exports::miden::base::note_script::Guest,
    miden::combat_account::combat_account::{init_combat, receive_asset},
};

struct InitCombatNote;

impl Guest for InitCombatNote {
    fn run(_arg: Word) {
        let sender = active_note::get_sender();
        let inputs = active_note::get_inputs();
        let assets = active_note::get_assets();

        // Deposit dust asset into combat account vault
        if assets.len() == 1 {
            receive_asset(assets[0]);
        }

        // Initialize combat with game data
        init_combat(
            sender.prefix, sender.suffix,
            inputs[0], inputs[1], inputs[2], inputs[3],
            inputs[4], inputs[5], inputs[6],
            inputs[7], inputs[8], inputs[9],
        );
    }
}
