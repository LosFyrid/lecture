package rangeutil

import "testing"

func TestParseSingleRange(t *testing.T) {
	t.Parallel()

	type tc struct {
		name      string
		header    string
		size      int64
		wantStart int64
		wantEnd   int64
		wantErr   bool
	}

	tests := []tc{
		{
			name:      "exact range",
			header:    "bytes=0-0",
			size:      100,
			wantStart: 0,
			wantEnd:   0,
		},
		{
			name:      "open ended",
			header:    "bytes=10-",
			size:      100,
			wantStart: 10,
			wantEnd:   99,
		},
		{
			name:      "clamp end",
			header:    "bytes=50-200",
			size:      100,
			wantStart: 50,
			wantEnd:   99,
		},
		{
			name:      "suffix range",
			header:    "bytes=-10",
			size:      100,
			wantStart: 90,
			wantEnd:   99,
		},
		{
			name:    "out of bounds start",
			header:  "bytes=200-300",
			size:    100,
			wantErr: true,
		},
		{
			name:    "multiple ranges unsupported",
			header:  "bytes=0-1,2-3",
			size:    100,
			wantErr: true,
		},
		{
			name:      "case insensitive unit",
			header:    "Bytes=1-2",
			size:      10,
			wantStart: 1,
			wantEnd:   2,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, err := ParseSingleRange(tt.header, tt.size)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil (range=%+v)", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.Start != tt.wantStart || got.End != tt.wantEnd {
				t.Fatalf("range mismatch: got=%+v want=[%d-%d]", got, tt.wantStart, tt.wantEnd)
			}
		})
	}
}

