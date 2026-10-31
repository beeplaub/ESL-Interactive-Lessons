package com.brenup.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertThrows;

import java.nio.ByteBuffer;
import org.junit.Test;

public class ScreenCaptureFrameTest {
    @Test
    public void compactsRowsAndIgnoresStridePaddingIncludingMissingFinalPadding() {
        byte[] paddedRows = new byte[]{
                1, 2, 3, 4, 5, 6, 7, 8, 90, 91, 92, 93,
                9, 10, 11, 12, 13, 14, 15, 16
        };

        assertArrayEquals(new byte[]{
                        1, 2, 3, 4, 5, 6, 7, 8,
                        9, 10, 11, 12, 13, 14, 15, 16
                }, ScreenCaptureService.copyRgbaRows(ByteBuffer.wrap(paddedRows), 2, 2, 12, 4));
    }

    @Test
    public void rejectsIncompleteImageRowsInsteadOfCopyingOutOfBounds() {
        ByteBuffer truncated = ByteBuffer.wrap(new byte[15]);

        assertThrows(IllegalArgumentException.class,
                () -> ScreenCaptureService.copyRgbaRows(truncated, 2, 2, 12, 4));
    }
}
