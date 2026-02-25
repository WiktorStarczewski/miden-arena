extern crate alloc;

use alloc::sync::Arc;

use combat_account_masm::compile_combat_component;
use miden_protocol::account::{Account, AccountStorageMode};
use miden_protocol::assembly::DefaultSourceManager;
use miden_standards::code_builder::CodeBuilder;
use miden_testing::{Auth, MockChain, AccountState};

/// Build a combat account using MockChain with our MASM component.
async fn setup_combat_account() -> (MockChain, Account) {
    let (component, _library) = compile_combat_component();

    let mut builder = MockChain::builder();
    let account = builder
        .add_account_from_builder(
            Auth::BasicAuth,
            Account::builder(rand::random())
                .storage_mode(AccountStorageMode::Public)
                .with_component(component),
            AccountState::Exists,
        )
        .unwrap();

    let mock_chain = builder.build().unwrap();
    (mock_chain, account)
}

/// Execute a tx_script against the combat account using the chain's committed state.
async fn execute_tx(
    mock_chain: &MockChain,
    account_id: miden_protocol::account::AccountId,
    script_code: &str,
) -> miden_protocol::transaction::ExecutedTransaction {
    let source_manager = Arc::new(DefaultSourceManager::default());
    let (_component, library) = compile_combat_component();

    let tx_script = CodeBuilder::with_source_manager(source_manager.clone())
        .with_dynamically_linked_library(&library)
        .unwrap()
        .compile_tx_script(script_code)
        .unwrap();

    let tx_context = mock_chain
        .build_tx_context(account_id, &[], &[])
        .unwrap()
        .tx_script(tx_script)
        .with_source_manager(source_manager)
        .build()
        .unwrap();

    tx_context.execute().await.unwrap()
}

/// Execute a tx and apply it to the chain.
async fn execute_and_apply(
    mock_chain: &mut MockChain,
    account_id: miden_protocol::account::AccountId,
    script_code: &str,
) {
    let executed = execute_tx(mock_chain, account_id, script_code).await;
    mock_chain.add_pending_executed_transaction(&executed).unwrap();
    mock_chain.prove_next_block().unwrap();
}

/// Helper to build a failing tx (returns Result instead of unwrapping).
async fn try_execute_tx(
    mock_chain: &MockChain,
    account_id: miden_protocol::account::AccountId,
    script_code: &str,
) -> Result<miden_protocol::transaction::ExecutedTransaction, Box<dyn std::error::Error>> {
    let source_manager = Arc::new(DefaultSourceManager::default());
    let (_component, library) = compile_combat_component();

    let tx_script = CodeBuilder::with_source_manager(source_manager.clone())
        .with_dynamically_linked_library(&library)
        .unwrap()
        .compile_tx_script(script_code)
        .unwrap();

    let tx_context = mock_chain
        .build_tx_context(account_id, &[], &[])
        .unwrap()
        .tx_script(tx_script)
        .with_source_manager(source_manager)
        .build()
        .unwrap();

    Ok(tx_context.execute().await?)
}

// Standard init script: teams A=[0,1,2], B=[3,4,5], players A=(100,101), B=(200,201)
// Stack layout (top-first): [c2b,c1b,c0b,c2a,c1a,c0a, pb_val1,pb_val0, pa_val1,pa_val0, sender1,sender0, pad(4)]
const INIT_SCRIPT: &str = "
    begin
        push.0.0.0.0.2.1.101.100.200.201.2.1.0.5.4.3
        call.::nofile::init_combat
        dropw dropw dropw dropw
    end
";

#[tokio::test]
async fn test_init_combat() {
    let (mut mock_chain, account) = setup_combat_account().await;

    let executed = execute_tx(&mock_chain, account.id(), INIT_SCRIPT).await;

    let delta = executed.account_delta().storage();
    let count = delta.values().count();
    assert!(count >= 12, "Expected at least 12 storage changes, got {}", count);
    println!("test_init_combat passed! Storage deltas: {}", count);
}

#[tokio::test]
async fn test_init_combat_invalid_champ_id() {
    let (mut mock_chain, account) = setup_combat_account().await;

    // Champion ID 8 is invalid (max is 7)
    let script = "
        begin
            push.0.0.0.0.2.1.201.200.101.100.2.1.0.5.4.8
            call.::nofile::init_combat
            dropw dropw dropw dropw
        end
    ";

    let result = try_execute_tx(&mock_chain, account.id(), script).await;
    assert!(result.is_err(), "Expected error for invalid champion ID 8");
    println!("test_init_combat_invalid_champ_id passed!");
}

#[tokio::test]
async fn test_init_combat_duplicate_in_team() {
    let (mut mock_chain, account) = setup_combat_account().await;

    // Team B has duplicate: c0b=3, c1b=3
    let script = "
        begin
            push.0.0.0.0.2.1.201.200.101.100.2.1.0.5.3.3
            call.::nofile::init_combat
            dropw dropw dropw dropw
        end
    ";

    let result = try_execute_tx(&mock_chain, account.id(), script).await;
    assert!(result.is_err(), "Expected error for duplicate champion in team");
    println!("test_init_combat_duplicate_in_team passed!");
}

#[tokio::test]
async fn test_init_combat_overlap_between_teams() {
    let (mut mock_chain, account) = setup_combat_account().await;

    // Champion 0 appears in both teams: A=[0,1,2], B=[0,4,5]
    let script = "
        begin
            push.0.0.0.0.2.1.201.200.101.100.2.1.0.5.4.0
            call.::nofile::init_combat
            dropw dropw dropw dropw
        end
    ";

    let result = try_execute_tx(&mock_chain, account.id(), script).await;
    assert!(result.is_err(), "Expected error for champion overlap between teams");
    println!("test_init_combat_overlap_between_teams passed!");
}

#[tokio::test]
async fn test_submit_commit() {
    let (mut mock_chain, account) = setup_combat_account().await;

    // First init combat
    execute_and_apply(&mut mock_chain, account.id(), INIT_SCRIPT).await;

    // Submit commit for player A (pfx=100, sfx=101)
    // Commit word: [1, 2, 3, 4]
    let script = "
        begin
            push.0.0.0.0.0.0.0.0.0.0.101.100.4.3.2.1
            call.::nofile::submit_commit
            dropw dropw dropw dropw
        end
    ";

    let executed = execute_tx(&mock_chain, account.id(), script).await;
    let delta = executed.account_delta().storage();
    let count = delta.values().count();
    assert!(count > 0, "Expected storage changes from submit_commit, got {}", count);
    println!("test_submit_commit passed! Storage deltas: {}", count);
}

#[tokio::test]
async fn test_submit_commit_wrong_player() {
    let (mut mock_chain, account) = setup_combat_account().await;

    // Init combat
    execute_and_apply(&mut mock_chain, account.id(), INIT_SCRIPT).await;

    // Try to commit as unknown player (pfx=999, sfx=999)
    let script = "
        begin
            push.0.0.0.0.0.0.0.0.0.0.999.999.4.3.2.1
            call.::nofile::submit_commit
            dropw dropw dropw dropw
        end
    ";

    let result = try_execute_tx(&mock_chain, account.id(), script).await;
    assert!(result.is_err(), "Expected error for unknown player");
    println!("test_submit_commit_wrong_player passed!");
}

#[tokio::test]
async fn test_init_combat_replay() {
    let (mut mock_chain, account) = setup_combat_account().await;

    // First init succeeds
    execute_and_apply(&mut mock_chain, account.id(), INIT_SCRIPT).await;

    // Second init should fail (combat already initialized)
    let result = try_execute_tx(&mock_chain, account.id(), INIT_SCRIPT).await;
    assert!(result.is_err(), "Expected error for double init");
    println!("test_init_combat_replay passed!");
}

#[tokio::test]
async fn test_submit_commit_double() {
    let (mut mock_chain, account) = setup_combat_account().await;

    // Init combat
    execute_and_apply(&mut mock_chain, account.id(), INIT_SCRIPT).await;

    // First commit for player A
    let commit_script = "
        begin
            push.0.0.0.0.0.0.0.0.0.0.101.100.4.3.2.1
            call.::nofile::submit_commit
            dropw dropw dropw dropw
        end
    ";
    execute_and_apply(&mut mock_chain, account.id(), commit_script).await;

    // Second commit for player A should fail (already committed)
    let result = try_execute_tx(&mock_chain, account.id(), commit_script).await;
    assert!(result.is_err(), "Expected error for double commit");
    println!("test_submit_commit_double passed!");
}

#[tokio::test]
async fn test_submit_commit_player_b() {
    let (mut mock_chain, account) = setup_combat_account().await;

    // Init combat
    execute_and_apply(&mut mock_chain, account.id(), INIT_SCRIPT).await;

    // Submit commit for player B: stored as [val_pos7, val_pos6, 0, 0]
    // Init pos 6=201, pos 7=200. Comparison: val_B(201)==submit_pos4, val_A(200)==submit_pos5
    // So submit needs pos4=201, pos5=200
    let script = "
        begin
            push.0.0.0.0.0.0.0.0.0.0.200.201.9.8.7.6
            call.::nofile::submit_commit
            dropw dropw dropw dropw
        end
    ";

    let executed = execute_tx(&mock_chain, account.id(), script).await;
    let delta = executed.account_delta().storage();
    let count = delta.values().count();
    assert!(count > 0, "Expected storage changes from player B commit, got {}", count);
    println!("test_submit_commit_player_b passed! Storage deltas: {}", count);
}
