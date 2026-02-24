//! Submit Move Note Script (Cross-Context)
//!
//! This note delivers a player's commit or reveal to the arena account.
//! Note inputs: [0] = phase (0=commit, 1=reveal)
//! Commit: arg = [commit_a, commit_b, commit_c, commit_d]
//! Reveal: arg = [encoded_move, nonce_p1, nonce_p2, 0]
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
bindings::export!(SubmitMoveNote);

use bindings::{
    exports::miden::base::note_script::Guest,
    miden::arena_account::arena_account::{submit_commit, submit_reveal},
};

struct SubmitMoveNote;

impl Guest for SubmitMoveNote {
    fn run(arg: Word) {
        let sender = active_note::get_sender();
        let inputs = active_note::get_inputs();
        let phase = inputs[0].as_u64();

        match phase {
            0 => {
                // Commit: arg = [commit_a, commit_b, commit_c, commit_d]
                submit_commit(
                    sender.prefix, sender.suffix,
                    arg[0], arg[1], arg[2], arg[3],
                );
            }
            1 => {
                // Reveal: arg = [encoded_move, nonce_p1, nonce_p2, 0]
                submit_reveal(
                    sender.prefix, sender.suffix,
                    arg[0], arg[1], arg[2],
                );
            }
            _ => panic!("invalid phase"),
        }
    }
}
