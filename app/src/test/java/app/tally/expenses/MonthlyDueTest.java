package app.tally.expenses;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The monthly reminder of a loan with no payback day (MonthlyDue): its next day, and a day missed while the phone was off. */
public class MonthlyDueTest {
    // ---------- next(): the day of the month it was lent, from a month after ----------

    @Test
    public void aMonthAfterItWasLent() {
        assertEquals("2026-11-22", MonthlyDue.next(22, "2026-10-22", "2026-10-25", false));
        assertEquals("2026-11-22", MonthlyDue.next(22, "2026-10-22", "2026-10-22", false)); // not on the day it was lent
    }

    @Test
    public void todayWhenItIsTheDayUnlessSkipped() {
        assertEquals("2026-11-22", MonthlyDue.next(22, "2026-10-22", "2026-11-22", false));
        assertEquals("2026-12-22", MonthlyDue.next(22, "2026-10-22", "2026-11-22", true));
    }

    @Test
    public void aDayAMonthLacksIsItsLastDay() {
        assertEquals("2027-04-30", MonthlyDue.next(31, "2027-03-31", "2027-04-01", false));
        assertEquals("2027-02-28", MonthlyDue.next(31, "2027-01-31", "2027-02-01", false));
        assertEquals("2028-02-29", MonthlyDue.next(30, "2028-01-30", "2028-02-01", false)); // a leap year
        assertEquals("2027-05-31", MonthlyDue.next(31, "2027-03-31", "2027-05-01", false)); // back to the 31st after April
    }

    @Test
    public void acrossTheYear() {
        assertEquals("2027-01-15", MonthlyDue.next(15, "2026-12-15", "2026-12-20", false));
    }

    @Test
    public void nothingForADayThatCantBe() {
        assertEquals("", MonthlyDue.next(0, "2026-10-22", "2026-11-01", false));
        assertEquals("", MonthlyDue.next(32, "2026-10-22", "2026-11-01", false));
        assertEquals("", MonthlyDue.next(5, "2026-10-05", "not a day", false));
    }

    // ---------- missed(): armed for a day that passed without showing ----------

    @Test
    public void aDayArmedForThatPassedUnshownIsMissed() {
        assertTrue(MonthlyDue.missed("2026-11-06", "", "2026-11-05"));
        assertTrue(MonthlyDue.missed("2026-11-06", "2026-10-05", "2026-11-05")); // shown last month, not this one
    }

    @Test
    public void shownOrNeverArmedIsNotMissed() {
        assertFalse(MonthlyDue.missed("2026-11-06", "2026-11-05", "2026-11-05"));
        assertFalse(MonthlyDue.missed("2026-11-06", "", ""));
        assertFalse(MonthlyDue.missed("2026-11-05", "", "2026-11-05")); // today's: still to come, not missed
        assertFalse(MonthlyDue.missed("2026-11-04", "", "2026-11-05"));
    }

    // ---------- date(): the day to arm ----------

    @Test
    public void aMissedDayComesToday() {
        // phone off on the 5th, back on the 6th: today, not December 5
        assertEquals("2026-11-06", MonthlyDue.date(5, "2026-09-05", "2026-11-06", "2026-10-05", "2026-11-05", false));
    }

    @Test
    public void offForMonthsGivesOneReminderThenTheNextDay() {
        // armed for Aug 5, the phone off until Nov 20: one reminder now ...
        assertEquals("2026-11-20", MonthlyDue.date(5, "2026-07-05", "2026-11-20", "", "2026-08-05", true));
        // ... and once it has shown today (armed for today), the next is December 5
        assertEquals("2026-12-05", MonthlyDue.date(5, "2026-07-05", "2026-11-20", "2026-11-20", "2026-11-20", true));
    }

    @Test
    public void armedForTodayStillComesAfterItsTime() {
        // an alarm held back past the set time by a battery saver: still today
        assertEquals("2026-11-22", MonthlyDue.date(22, "2026-10-22", "2026-11-22", "", "2026-11-22", true));
    }

    @Test
    public void enteredAfterTodaysTimeWaitsAMonth() {
        // lent on Oct 22, written down on Nov 22 after the reminder time: not reminded a minute later
        assertEquals("2026-12-22", MonthlyDue.date(22, "2026-10-22", "2026-11-22", "", "", true));
    }

    @Test
    public void enteredBeforeTodaysTimeComesToday() {
        assertEquals("2026-11-22", MonthlyDue.date(22, "2026-10-22", "2026-11-22", "", "", false));
    }

    @Test
    public void shownTodayWaitsForNextMonth() {
        assertEquals("2026-12-22", MonthlyDue.date(22, "2026-10-22", "2026-11-22", "2026-11-22", "2026-11-22", false));
    }

    // ---------- mark(): the day remembered as armed for ----------

    @Test
    public void aMissedDayStaysMarkedUntilItShows() {
        // re-armed again before the catch-up showed: still missed, so still sent at once (not at the set time)
        String m = MonthlyDue.mark("2026-11-06", "", "2026-11-05", "2026-11-06");
        assertEquals("2026-11-05", m);
        assertTrue(MonthlyDue.missed("2026-11-06", "", m));
        // the phone off again until the 9th: still one reminder, at once
        assertTrue(MonthlyDue.missed("2026-11-09", "", m));
    }

    @Test
    public void onceShownTheNextDayIsMarked() {
        String d = MonthlyDue.date(5, "2026-09-05", "2026-11-06", "2026-11-06", "2026-11-05", false);
        assertEquals("2026-12-05", d);
        assertEquals("2026-12-05", MonthlyDue.mark("2026-11-06", "2026-11-06", "2026-11-05", d));
    }

    @Test
    public void armedAheadKeepsItsDay() {
        assertEquals("2026-12-22", MonthlyDue.date(22, "2026-10-22", "2026-11-25", "2026-11-22", "2026-12-22", false));
    }
}
