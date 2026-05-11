use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

declare_id!("9JAVCcRBhZz4Jjx1qMdCgZj7bzEkVE5aMSeHwM94278F");

/// Hard upper bound on how long a subscription period may be.
/// 10 years in seconds — comfortably above any realistic billing cadence,
/// and small enough that `next_charge_at + period_seconds` can never
/// overflow `i64` even after centuries of cranking.
pub const MAX_PERIOD_SECONDS: i64 = 60 * 60 * 24 * 365 * 10;

#[program]
pub mod subs {
    use super::*;

    pub fn create_subscription(
        ctx: Context<CreateSubscription>,
        amount: u64,
        period_seconds: i64,
    ) -> Result<()> {
        require!(amount > 0, SubsError::InvalidAmount);
        require!(period_seconds > 0, SubsError::InvalidPeriod);
        require!(
            period_seconds <= MAX_PERIOD_SECONDS,
            SubsError::PeriodTooLong
        );

        let now = Clock::get()?.unix_timestamp;
        let subscription = &mut ctx.accounts.subscription;
        subscription.subscriber = ctx.accounts.subscriber.key();
        subscription.merchant = ctx.accounts.merchant.key();
        subscription.mint = ctx.accounts.mint.key();
        subscription.amount = amount;
        subscription.period_seconds = period_seconds;
        subscription.next_charge_at = now;
        subscription.status = SubscriptionStatus::Active;
        subscription.bump = ctx.bumps.subscription;

        emit!(SubscriptionCreated {
            subscription: subscription.key(),
            subscriber: subscription.subscriber,
            merchant: subscription.merchant,
            mint: subscription.mint,
            amount: subscription.amount,
            period_seconds: subscription.period_seconds,
            next_charge_at: subscription.next_charge_at,
        });

        msg!("subscription created; first charge due immediately");
        Ok(())
    }

    pub fn charge_subscription(ctx: Context<ChargeSubscription>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        require!(
            ctx.accounts.subscription.status == SubscriptionStatus::Active,
            SubsError::Paused
        );
        require!(
            now >= ctx.accounts.subscription.next_charge_at,
            SubsError::NotDueYet
        );

        let amount = ctx.accounts.subscription.amount;
        let new_next_charge_at = ctx
            .accounts
            .subscription
            .next_charge_at
            .checked_add(ctx.accounts.subscription.period_seconds)
            .ok_or(SubsError::Overflow)?;

        ctx.accounts.subscription.next_charge_at = new_next_charge_at;

        let signer_seeds: &[&[&[u8]]] = &[&[b"authority", &[ctx.bumps.authority]]];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.subscriber_token.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.merchant_token.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

        emit!(SubscriptionCharged {
            subscription: ctx.accounts.subscription.key(),
            subscriber: ctx.accounts.subscription.subscriber,
            merchant: ctx.accounts.subscription.merchant,
            amount,
            next_charge_at: new_next_charge_at,
        });

        msg!(
            "charged {} (units); next due at {}",
            amount,
            new_next_charge_at
        );
        Ok(())
    }

    pub fn cancel_subscription(ctx: Context<CancelSubscription>) -> Result<()> {
        emit!(SubscriptionCancelled {
            subscription: ctx.accounts.subscription.key(),
            by: ctx.accounts.signer.key(),
        });
        msg!("subscription cancelled");
        Ok(())
    }

    pub fn pause_subscription(ctx: Context<ChangeSubscriptionStatus>) -> Result<()> {
        let signer_key = ctx.accounts.signer.key();
        let subscription = &mut ctx.accounts.subscription;
        require!(
            subscription.status == SubscriptionStatus::Active,
            SubsError::AlreadyPaused
        );
        subscription.status = SubscriptionStatus::Paused;

        emit!(SubscriptionPaused {
            subscription: subscription.key(),
            by: signer_key,
        });
        msg!("subscription paused");
        Ok(())
    }

    pub fn resume_subscription(ctx: Context<ChangeSubscriptionStatus>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let signer_key = ctx.accounts.signer.key();
        let subscription = &mut ctx.accounts.subscription;
        require!(
            subscription.status == SubscriptionStatus::Paused,
            SubsError::NotPaused
        );

        // Don't backcharge for the pause window. Push the next charge out by
        // one full period from now, so the customer effectively gets a fresh
        // billing cycle on resume.
        subscription.next_charge_at = now
            .checked_add(subscription.period_seconds)
            .ok_or(SubsError::Overflow)?;
        subscription.status = SubscriptionStatus::Active;

        emit!(SubscriptionResumed {
            subscription: subscription.key(),
            by: signer_key,
            next_charge_at: subscription.next_charge_at,
        });

        msg!(
            "subscription resumed; next charge at {}",
            subscription.next_charge_at
        );
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateSubscription<'info> {
    #[account(mut)]
    pub subscriber: Signer<'info>,

    /// CHECK: just an address recorded as the recipient
    pub merchant: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = subscriber,
        space = 8 + Subscription::INIT_SPACE,
        seeds = [b"subscription", subscriber.key().as_ref(), merchant.key().as_ref()],
        bump,
    )]
    pub subscription: Account<'info, Subscription>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ChargeSubscription<'info> {
    #[account(
        mut,
        has_one = subscriber,
        has_one = merchant,
        has_one = mint,
        seeds = [b"subscription", subscriber.key().as_ref(), merchant.key().as_ref()],
        bump = subscription.bump,
    )]
    pub subscription: Account<'info, Subscription>,

    /// CHECK: validated by `has_one = subscriber` above
    pub subscriber: UncheckedAccount<'info>,

    /// CHECK: validated by `has_one = merchant` above
    pub merchant: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = subscriber,
    )]
    pub subscriber_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = merchant,
    )]
    pub merchant_token: Account<'info, TokenAccount>,

    /// CHECK: program-wide delegate authority. The address is enforced by
    /// the `seeds` constraint; we only use it to sign CPIs.
    #[account(seeds = [b"authority"], bump)]
    pub authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelSubscription<'info> {
    #[account(
        mut,
        has_one = subscriber,
        has_one = merchant,
        seeds = [b"subscription", subscriber.key().as_ref(), merchant.key().as_ref()],
        bump = subscription.bump,
        close = subscriber,
    )]
    pub subscription: Account<'info, Subscription>,

    /// CHECK: validated by `has_one = subscriber` above; must be mut so
    /// Anchor can refund rent lamports here when closing the PDA.
    #[account(mut)]
    pub subscriber: UncheckedAccount<'info>,

    /// CHECK: validated by `has_one = merchant` above
    pub merchant: UncheckedAccount<'info>,

    /// Either the subscriber or the merchant may cancel.
    #[account(
        constraint = (signer.key() == subscriber.key() || signer.key() == merchant.key())
            @ SubsError::Unauthorized,
    )]
    pub signer: Signer<'info>,
}

/// Used by both `pause_subscription` and `resume_subscription`. Same shape as
/// cancel but without the `close = subscriber` — pause/resume just mutate
/// state in place.
#[derive(Accounts)]
pub struct ChangeSubscriptionStatus<'info> {
    #[account(
        mut,
        has_one = subscriber,
        has_one = merchant,
        seeds = [b"subscription", subscriber.key().as_ref(), merchant.key().as_ref()],
        bump = subscription.bump,
    )]
    pub subscription: Account<'info, Subscription>,

    /// CHECK: validated by `has_one = subscriber` above
    pub subscriber: UncheckedAccount<'info>,

    /// CHECK: validated by `has_one = merchant` above
    pub merchant: UncheckedAccount<'info>,

    /// Either the subscriber or the merchant may pause/resume.
    #[account(
        constraint = (signer.key() == subscriber.key() || signer.key() == merchant.key())
            @ SubsError::Unauthorized,
    )]
    pub signer: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Subscription {
    pub subscriber: Pubkey,
    pub merchant: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub period_seconds: i64,
    pub next_charge_at: i64,
    pub status: SubscriptionStatus,
    pub bump: u8,
    /// Reserved for future fields. When you add a new field, take the bytes
    /// from this padding (e.g. add `paused_at: i64` and shrink to `[u8; 248]`).
    /// Existing on-chain accounts will deserialize the new field as zero,
    /// which is usually a sensible default.
    pub padding: [u8; 256],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum SubscriptionStatus {
    /// Charges run on schedule. Default state at creation.
    Active,
    /// Charges are suspended until `resume_subscription` is called.
    /// State and history are preserved; only the crank is gated off.
    Paused,
}

/// Emitted by `create_subscription`. Contains everything an off-chain
/// indexer needs to record a new subscription without having to fetch the
/// PDA itself.
#[event]
pub struct SubscriptionCreated {
    pub subscription: Pubkey,
    pub subscriber: Pubkey,
    pub merchant: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub period_seconds: i64,
    pub next_charge_at: i64,
}

/// Emitted by `charge_subscription`.
#[event]
pub struct SubscriptionCharged {
    pub subscription: Pubkey,
    pub subscriber: Pubkey,
    pub merchant: Pubkey,
    pub amount: u64,
    pub next_charge_at: i64,
}

/// Emitted by `cancel_subscription`. `by` is whichever party (subscriber or
/// merchant) signed the cancel.
#[event]
pub struct SubscriptionCancelled {
    pub subscription: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct SubscriptionPaused {
    pub subscription: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct SubscriptionResumed {
    pub subscription: Pubkey,
    pub by: Pubkey,
    pub next_charge_at: i64,
}

#[error_code]
pub enum SubsError {
    #[msg("Subscription is not yet due to be charged")]
    NotDueYet,
    #[msg("Math overflow")]
    Overflow,
    #[msg("Only the subscriber or merchant can perform this action")]
    Unauthorized,
    #[msg("Subscription amount must be greater than zero")]
    InvalidAmount,
    #[msg("Subscription period must be greater than zero")]
    InvalidPeriod,
    #[msg("Subscription period exceeds the maximum allowed (10 years)")]
    PeriodTooLong,
    #[msg("Subscription is paused; resume it before charging")]
    Paused,
    #[msg("Subscription is already paused")]
    AlreadyPaused,
    #[msg("Subscription is not paused")]
    NotPaused,
}
