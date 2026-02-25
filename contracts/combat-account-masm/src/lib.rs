use miden_protocol::{
    account::{AccountComponent, AccountType, StorageSlot, StorageSlotName},
    assembly::Library,
    transaction::TransactionKernel,
};

/// Compile the MASM combat component from source.
///
/// Returns both the `AccountComponent` (for account building) and the compiled `Library`
/// (for tx script linking in tests — dynamic calls need the library to resolve procedure digests).
pub fn compile_combat_component() -> (AccountComponent, Library) {
    let masm_source = include_str!("../masm/combat.masm");
    let assembler = TransactionKernel::assembler();
    let library = assembler.assemble_library([masm_source]).unwrap();
    let component = AccountComponent::new(library.clone(), storage_slots())
        .unwrap()
        .with_supported_type(AccountType::RegularAccountUpdatableCode);
    (component, library)
}

/// All 20 storage slots for the combat account, matching the Rust version's layout exactly.
pub fn storage_slots() -> Vec<StorageSlot> {
    vec![
        StorageSlot::with_empty_value(StorageSlotName::new("combat::combat_state").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::player_a").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::player_b").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::team_a").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::team_b").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::round").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::move_a_commit").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::move_b_commit").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::move_a_reveal").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::move_b_reveal").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::champ_a_0").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::champ_a_1").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::champ_a_2").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::champ_b_0").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::champ_b_1").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::champ_b_2").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::timeout_height").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::matchmaking_id").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::result_script_hash").unwrap()),
        StorageSlot::with_empty_value(StorageSlotName::new("combat::faucet_id").unwrap()),
    ]
}
