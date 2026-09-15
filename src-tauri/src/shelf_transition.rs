//! Identifica una chiusura: una riapertura invalida anche il fallback nativo.
pub struct ShelfTransition {
    generation: u32,
    closing: bool,
}

impl ShelfTransition {
    pub const fn new() -> Self {
        Self { generation: 0, closing: false }
    }

    pub fn show(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        self.closing = false;
    }

    pub fn is_closing(&self) -> bool { self.closing }

    pub fn request_close(&mut self) -> Option<u32> {
        if self.closing { return None; }
        self.generation = self.generation.wrapping_add(1);
        self.closing = true;
        Some(self.generation)
    }

    pub fn finish_close(&mut self, generation: u32) -> bool {
        if !self.closing || self.generation != generation { return false; }
        self.closing = false;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reopening_cancels_late_animation_and_fallback() {
        let mut state = ShelfTransition::new();
        let old = state.request_close().unwrap();
        state.show();
        assert!(!state.finish_close(old));
        let new = state.request_close().unwrap();
        assert!(!state.finish_close(old));
        assert!(state.finish_close(new));
    }

    #[test]
    fn repeated_close_and_completion_are_idempotent() {
        let mut state = ShelfTransition::new();
        let generation = state.request_close().unwrap();
        assert!(state.is_closing());
        assert!(state.request_close().is_none());
        assert!(state.finish_close(generation));
        assert!(!state.finish_close(generation));
        assert!(!state.is_closing());
    }
}
